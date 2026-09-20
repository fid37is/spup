// src/lib/chat-crypto.ts
// E2E encryption using ECDH key exchange + AES-GCM message encryption.
// Keys are generated in the browser and the private key never leaves the
// device unencrypted — see the "Cross-device key sync" section below for
// how it's optionally recovered on a new device.

const KEY_ALGO  = { name: 'ECDH', namedCurve: 'P-256' } as const
const ENC_ALGO  = { name: 'AES-GCM', length: 256 }      as const
const STORE_KEY = 'spup_chat_keypair'
const ENC_PREFIX = 'enc:'
const WRAP_ITERATIONS = 250_000

// TS 5.7's DOM lib made Uint8Array generic over its backing buffer type and
// narrowed BufferSource to exclude SharedArrayBuffer, which now trips even
// our own plain `new Uint8Array(n)` / Uint8Array.from(...) values under
// some TS/lib configurations, despite them never actually being
// SharedArrayBuffer-backed. This is a type-level cast for that mismatch,
// not a behavioral change — every value passed through here is a normal
// ArrayBuffer-backed Uint8Array at runtime.
function bs(u: Uint8Array): BufferSource {
  return u as unknown as BufferSource
}

export class WrongPasswordError extends Error {
  constructor() { super('Incorrect password') }
}

// ── Key generation & persistence ──────────────────────────────────────────────

type KeyPairResult = { publicKeyB64: string; privateKey: CryptoKey }

/**
 * Fast path only — returns the keypair already cached in this browser, or
 * null if this device has never generated/recovered one. Callers that can
 * prompt for a password should fall back to recoverOrCreateKeyPair() below
 * when this returns null, rather than silently minting a fresh identity.
 */
export async function getStoredKeyPair(): Promise<KeyPairResult | null> {
  const stored = localStorage.getItem(STORE_KEY)
  if (!stored) return null
  try {
    const { pub, priv } = JSON.parse(stored)
    const privateKey = await crypto.subtle.importKey('jwk', priv, KEY_ALGO, true, ['deriveKey'])
    return { publicKeyB64: pub, privateKey }
  } catch {
    return null // corrupted — treat as absent
  }
}

async function generateAndStoreKeyPair(): Promise<KeyPairResult & { privateKeyJwk: JsonWebKey }> {
  const keypair = await crypto.subtle.generateKey(KEY_ALGO, true, ['deriveKey'])
  const pubRaw  = await crypto.subtle.exportKey('raw',  keypair.publicKey)
  const privJwk = await crypto.subtle.exportKey('jwk',  keypair.privateKey) as JsonWebKey
  const publicKeyB64 = uint8ToBase64(new Uint8Array(pubRaw))
  localStorage.setItem(STORE_KEY, JSON.stringify({ pub: publicKeyB64, priv: privJwk }))
  return { publicKeyB64, privateKey: keypair.privateKey, privateKeyJwk: privJwk }
}

async function storeRecoveredKeyPair(privJwk: JsonWebKey): Promise<KeyPairResult> {
  const privateKey = await crypto.subtle.importKey('jwk', privJwk, KEY_ALGO, true, ['deriveKey'])
  const pubRaw = await crypto.subtle.exportKey('raw', await derivePublicKey(privateKey, privJwk))
  const publicKeyB64 = uint8ToBase64(new Uint8Array(pubRaw))
  localStorage.setItem(STORE_KEY, JSON.stringify({ pub: publicKeyB64, priv: privJwk }))
  return { publicKeyB64, privateKey }
}

// ECDH private JWKs carry the public coordinates (x/y) too, so the public
// key can be reconstructed without a second stored value.
async function derivePublicKey(_privateKey: CryptoKey, privJwk: JsonWebKey): Promise<CryptoKey> {
  const pubJwk: JsonWebKey = { kty: privJwk.kty, crv: privJwk.crv, x: privJwk.x, y: privJwk.y, ext: true }
  return crypto.subtle.importKey('jwk', pubJwk, KEY_ALGO, true, [])
}

/**
 * The full cross-device-aware key acquisition flow. Call this instead of
 * relying on getStoredKeyPair() alone.
 *
 *  1. Already cached on this device → return it, no prompts, no network.
 *  2. Not cached, but the server has a wrapped key from another device →
 *     this is a "new device for an existing identity" — ask for the
 *     account password via getPassword(), unwrap, cache locally, return.
 *     A wrong password throws WrongPasswordError; caller should let the
 *     user retry rather than falling through to key generation, or a
 *     mistyped password would silently fork the identity.
 *  3. Not cached, and the server has nothing wrapped yet → brand new
 *     identity. Generate it, and if getPassword() is provided, also wrap
 *     and upload it immediately so a future device can recover it.
 */
export async function recoverOrCreateKeyPair(opts: {
  fetchWrapped: () => Promise<{ wrapped: string; salt: string; iv: string } | null>
  uploadWrapped: (wrapped: string, salt: string, iv: string) => Promise<void>
  getPassword: () => Promise<string | null> // null = user cancelled
}): Promise<KeyPairResult & { recoveredFromServer: boolean }> {
  const cached = await getStoredKeyPair()
  if (cached) return { ...cached, recoveredFromServer: false }

  const remote = await opts.fetchWrapped()
  if (remote) {
    const password = await opts.getPassword()
    if (password === null) throw new Error('Password entry cancelled')
    const privJwk = await unwrapPrivateKeyJwk(remote.wrapped, remote.salt, remote.iv, password)
    const pair = await storeRecoveredKeyPair(privJwk)
    return { ...pair, recoveredFromServer: true }
  }

  const generated = await generateAndStoreKeyPair()
  const password = await opts.getPassword().catch(() => null)
  if (password) {
    const { wrapped, salt, iv } = await wrapPrivateKeyJwk(generated.privateKeyJwk, password)
    await opts.uploadWrapped(wrapped, salt, iv)
  }
  return { publicKeyB64: generated.publicKeyB64, privateKey: generated.privateKey, recoveredFromServer: false }
}

// ── Password-based key wrapping (cross-device sync) ───────────────────────────

async function deriveWrappingKey(password: string, saltB64: string): Promise<CryptoKey> {
  const salt = base64ToUint8(saltB64)
  const baseKey = await crypto.subtle.importKey('raw', bs(new TextEncoder().encode(password)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bs(salt), iterations: WRAP_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    ENC_ALGO,
    false,
    ['encrypt', 'decrypt']
  )
}

async function wrapPrivateKeyJwk(privJwk: JsonWebKey, password: string): Promise<{ wrapped: string; salt: string; iv: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16))
  const saltB64 = uint8ToBase64(saltBytes)
  const wrappingKey = await deriveWrappingKey(password, saltB64)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(privJwk))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(iv) }, wrappingKey, bs(plaintext))
  return { wrapped: uint8ToBase64(new Uint8Array(ciphertext)), salt: saltB64, iv: uint8ToBase64(iv) }
}

async function unwrapPrivateKeyJwk(wrappedB64: string, saltB64: string, ivB64: string, password: string): Promise<JsonWebKey> {
  const wrappingKey = await deriveWrappingKey(password, saltB64)
  const iv = base64ToUint8(ivB64)
  const ciphertext = base64ToUint8(wrappedB64)
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bs(iv) }, wrappingKey, bs(ciphertext))
    return JSON.parse(new TextDecoder().decode(plaintext))
  } catch {
    // AES-GCM's auth tag makes a wrong key fail decryption outright — this
    // is what actually tells us the password was wrong, no separate
    // server-side verification needed.
    throw new WrongPasswordError()
  }
}

/**
 * For changing the chat PIN: re-wraps the E2E private key under the NEW
 * PIN+pepper password, so a new device can still recover it with the new PIN.
 *
 * Uses this device's cached key when there is one; otherwise unwraps the
 * server's copy with the OLD password (throws WrongPasswordError if that
 * doesn't open it). Returns null when no identity exists yet - nothing to
 * re-wrap. The result is ready for uploadWrappedKeyAction().
 */
export async function rewrapKeyForNewPassword(opts: {
  oldPassword: string
  newPassword: string
  fetchWrapped: () => Promise<{ wrapped: string; salt: string; iv: string } | null>
}): Promise<{ wrapped: string; salt: string; iv: string } | null> {
  let privJwk: JsonWebKey | null = null
  const stored = localStorage.getItem(STORE_KEY)
  if (stored) {
    try { privJwk = JSON.parse(stored).priv as JsonWebKey } catch { privJwk = null }
  }
  if (!privJwk) {
    const remote = await opts.fetchWrapped()
    if (!remote) return null
    privJwk = await unwrapPrivateKeyJwk(remote.wrapped, remote.salt, remote.iv, opts.oldPassword)
  }
  return wrapPrivateKeyJwk(privJwk, opts.newPassword)
}

// ── Shared key derivation ─────────────────────────────────────────────────────

export async function deriveSharedKey(
  myPrivateKey: CryptoKey,
  theirPublicKeyB64: string
): Promise<CryptoKey> {
  const raw = base64ToUint8(theirPublicKeyB64)
  const theirPublicKey = await crypto.subtle.importKey('raw', bs(raw), { name: 'ECDH', namedCurve: 'P-256' }, true, [])
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    ENC_ALGO,
    false,
    ['encrypt', 'decrypt']
  )
}

// ── Encrypt / Decrypt ─────────────────────────────────────────────────────────

export async function encryptMessage(
  plaintext: string,
  sharedKey: CryptoKey
): Promise<string> {
  const iv          = crypto.getRandomValues(new Uint8Array(12))
  const encoded     = new TextEncoder().encode(plaintext)
  const ciphertext  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(iv) }, sharedKey, bs(encoded))
  const buf         = new Uint8Array(12 + ciphertext.byteLength)
  buf.set(iv, 0)
  buf.set(new Uint8Array(ciphertext), 12)
  return ENC_PREFIX + uint8ToBase64(buf)
}

export async function decryptMessage(
  encryptedWithPrefix: string,
  sharedKey: CryptoKey
): Promise<string> {
  try {
    const b64 = encryptedWithPrefix.startsWith(ENC_PREFIX)
      ? encryptedWithPrefix.slice(ENC_PREFIX.length)
      : encryptedWithPrefix
    const buf       = base64ToUint8(b64)
    const iv        = buf.slice(0, 12)
    const ciphertext = buf.slice(12)
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bs(iv) }, sharedKey, bs(ciphertext))
    return new TextDecoder().decode(decrypted)
  } catch {
    return '[Unable to decrypt]'
  }
}

export function isEncrypted(text: string | null): boolean {
  return !!text?.startsWith(ENC_PREFIX)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uint8ToBase64(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
}

function base64ToUint8(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}