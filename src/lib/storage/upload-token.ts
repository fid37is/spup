// src/lib/storage/upload-token.ts
//
// Server-only. A short-lived, signed permission slip for ONE file upload straight from the
// phone to the Bunny Edge Script (edge/upload-edge-script.js). The script checks the same
// signature with the same secret (UPLOAD_SIGNING_SECRET), so it never has to call back here.
//
// Token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload))

import { createHmac } from 'node:crypto'

export interface UploadTokenPayload {
  /** Where the file goes in the storage zone, e.g. para/<profile>/posts/<random>.mp4 */
  p: string
  /** The one content type allowed. */
  m: string
  /** Largest size allowed, in bytes. */
  x: number
  /** Expiry, seconds since epoch. */
  e: number
  /** users.id of the uploader (for the logs). */
  u: string
}

const b64url = (b: Buffer) => b.toString('base64url')

export function signUploadToken(payload: UploadTokenPayload, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  const sig = b64url(createHmac('sha256', secret).update(body).digest())
  return `${body}.${sig}`
}
