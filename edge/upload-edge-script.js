// edge/upload-edge-script.js
//
// Runs on bunny.net (Edge Platform -> Scripting). Receives a photo/video straight from the
// phone and writes it to the storage zone, so the file never goes through Vercel (whose
// 4.5MB request limit is what was breaking video uploads).
//
// The phone first asks the Spup server (/api/upload/sign) for a signed token that names ONE
// file path, ONE content type and a size limit. This script only accepts an upload that
// carries a valid, unexpired token, and re-checks the type, the size and the file's first
// bytes before writing anything. The storage password lives only here, as a secret.
//
// Environment (Env Configuration on the script):
//   Secrets:    UPLOAD_SIGNING_SECRET      same value as on Vercel
//               BUNNY_STORAGE_ACCESS_KEY   the storage zone password (use the zone's Password)
//   Variables:  BUNNY_STORAGE_ZONE         e.g. spup-storage
//               BUNNY_STORAGE_ENDPOINT     optional, default storage.bunnycdn.com
//               ALLOWED_ORIGINS            optional, comma list, default https://spup.live,https://www.spup.live
//
// Request:  PUT <script-url>/?t=<token>   body = the raw file, Content-Type = the file's type
// Answer:   200 {"ok":true}  or  4xx/5xx {"error":"..."}

import * as BunnySDK from "@bunny.net/edgescript-sdk";
import process from "node:process";

const env = (k, d = "") => (process.env[k] || d).trim();
const enc = new TextEncoder();

function allowedOrigins() {
  return env("ALLOWED_ORIGINS", "https://spup.live,https://www.spup.live")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

const json = (status, body, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(origin ? cors(origin) : {}) },
  });

function b64urlToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Returns the token's payload if the signature is valid and it has not expired, else null. */
async function readToken(token, secret) {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) return null;
  try {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("HMAC", key, b64urlToBytes(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
    if (!p || typeof p.p !== "string" || typeof p.m !== "string" || typeof p.x !== "number" || typeof p.e !== "number") return null;
    if (p.e < Math.floor(Date.now() / 1000)) return null;
    if (p.p.includes("..") || p.p.startsWith("/")) return null;
    return p;
  } catch {
    return null;
  }
}

const startsWith = (b, ...bytes) => bytes.every((v, i) => b[i] === v);
const ascii = (b, from, to) => String.fromCharCode(...b.slice(from, to));

/** Do the first bytes of the file match the type it claims to be? */
function looksLike(mime, b) {
  switch (mime) {
    case "image/jpeg": return startsWith(b, 0xff, 0xd8, 0xff);
    case "image/png": return startsWith(b, 0x89, 0x50, 0x4e, 0x47);
    case "image/gif": return ascii(b, 0, 4) === "GIF8";
    case "image/webp": return ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP";
    case "video/mp4": case "video/quicktime": case "video/mov": return ascii(b, 4, 8) === "ftyp";
    case "video/webm": return startsWith(b, 0x1a, 0x45, 0xdf, 0xa3);
    case "video/avi": return ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "AVI ";
    default: return false;
  }
}

async function putToStorage(path, bytes, contentType) {
  const zone = env("BUNNY_STORAGE_ZONE", "spup-storage");
  const endpoint = env("BUNNY_STORAGE_ENDPOINT", "storage.bunnycdn.com").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const key = env("BUNNY_STORAGE_ACCESS_KEY");
  if (!key) return { ok: false, status: 500, error: "Media storage is not configured." };

  const url = `https://${endpoint}/${zone}/${path.split("/").map(encodeURIComponent).join("/")}`;
  let last = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { method: "PUT", headers: { AccessKey: key, "Content-Type": contentType }, body: bytes });
      if (res.ok) return { ok: true };
      last = res.status;
      if (res.status < 500 && res.status !== 429) break; // a rejection will not succeed on retry
    } catch {
      last = 0;
    }
    await new Promise((r) => setTimeout(r, 400 * attempt));
  }
  console.error(`Storage write failed for ${path}: ${last}`);
  return { ok: false, status: 502, error: "Upload failed. Please try again." };
}

BunnySDK.net.http.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  const originOk = allowedOrigins().includes(origin);

  if (request.method === "OPTIONS") {
    return originOk ? new Response(null, { status: 204, headers: cors(origin) }) : new Response(null, { status: 403 });
  }
  if (!originOk) return json(403, { error: "Not allowed" });
  if (request.method !== "PUT") return json(405, { error: "Method not allowed" }, origin);

  const secret = env("UPLOAD_SIGNING_SECRET");
  if (!secret) return json(500, { error: "Uploads are not configured." }, origin);

  const token = await readToken(new URL(request.url).searchParams.get("t"), secret);
  if (!token) return json(401, { error: "Upload link expired. Please try again." }, origin);

  const mime = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (mime !== token.m) return json(400, { error: "File type does not match." }, origin);

  // Refuse an oversized upload before reading it, and again after (the header can be missing or wrong).
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > token.x) return json(413, { error: "File too large." }, origin);

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > token.x) {
    return json(bytes.byteLength === 0 ? 400 : 413, { error: bytes.byteLength === 0 ? "That file is empty." : "File too large." }, origin);
  }
  if (!looksLike(mime, bytes)) return json(400, { error: "That file does not look like a valid photo or video." }, origin);

  const stored = await putToStorage(token.p, bytes, mime);
  if (!stored.ok) return json(stored.status, { error: stored.error }, origin);
  return json(200, { ok: true }, origin);
});
