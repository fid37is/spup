// src/lib/chat-crypto.ts
// E2E encryption using ECDH key exchange + AES-GCM message encryption.
// Keys are generated in the browser and private key never leaves the device.

const KEY_ALGO  = { name: 'ECDH', namedCurve: 'P-256' } as const
const ENC_ALGO  = { name: 'AES-GCM', length: 256 }      as const
const STORE_KEY = 'spup_chat_keypair'
const ENC_PREFIX = 'enc:'

// ── Key generation & persistence ──────────────────────────────────────────────

export async function getOrCreateKeyPair(): Promise<{
  publicKeyB64: string
  privateKey: CryptoKey
}> {
  const stored = localStorage.getItem(STORE_KEY)
  if (stored) {
    try {
      const { pub, priv } = JSON.parse(stored)
      const privateKey = await crypto.subtle.importKey(
        'jwk', priv, KEY_ALGO, true, ['deriveKey']
      )
      return { publicKeyB64: pub, privateKey }
    } catch {
      // Corrupted — regenerate
    }
  }
  return generateAndStoreKeyPair()
}

async function generateAndStoreKeyPair() {
  const keypair = await crypto.subtle.generateKey(KEY_ALGO, true, ['deriveKey'])
  const pubRaw  = await crypto.subtle.exportKey('raw',  keypair.publicKey)
  const privJwk = await crypto.subtle.exportKey('jwk',  keypair.privateKey)
  const publicKeyB64 = uint8ToBase64(new Uint8Array(pubRaw))
  localStorage.setItem(STORE_KEY, JSON.stringify({ pub: publicKeyB64, priv: privJwk }))
  return { publicKeyB64, privateKey: keypair.privateKey }
}

// ── Shared key derivation ─────────────────────────────────────────────────────

export async function deriveSharedKey(
  myPrivateKey: CryptoKey,
  theirPublicKeyB64: string
): Promise<CryptoKey> {
  const raw = base64ToUint8(theirPublicKeyB64)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const theirPublicKey = await (crypto.subtle as any).importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
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
  const ciphertext  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, encoded)
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
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sharedKey, ciphertext)
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
