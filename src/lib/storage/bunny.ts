// src/lib/storage/bunny.ts
//
// Server-only: writes a file into the bunny.net storage zone. The zone password
// (BUNNY_STORAGE_ACCESS_KEY) must only ever exist on the server - never in a
// NEXT_PUBLIC_ variable and never sent to the browser. That is why uploads pass through
// our API routes instead of going from the phone straight to Bunny.

import { MEDIA_CDN_URL } from '../media-config'

const ZONE = () => process.env.BUNNY_STORAGE_ZONE || 'spup-storage'
const ENDPOINT = () => (process.env.BUNNY_STORAGE_ENDPOINT || 'storage.bunnycdn.com').replace(/^https?:\/\//, '').replace(/\/.*$/, '')
// Test hook only; production never sets this.
const BASE = () => process.env.BUNNY_STORAGE_BASE_URL || `https://${ENDPOINT()}`

export class StorageError extends Error {
  constructor(message: string, public status = 500) { super(message) }
}

/** The public CDN address of a stored path. */
export function publicUrl(path: string): string {
  return `${MEDIA_CDN_URL}/${path}`
}

/** Stores `bytes` at `path` (e.g. para/<profile>/posts/<name>.webp). Retries brief network failures. */
export async function putToBunny(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const key = (process.env.BUNNY_STORAGE_ACCESS_KEY || '').trim()
  if (!key) throw new StorageError('Media storage is not configured (BUNNY_STORAGE_ACCESS_KEY is missing).')

  const url = `${BASE()}/${ZONE()}/${path.split('/').map(encodeURIComponent).join('/')}`
  let lastStatus: number | string = 'network error'
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { method: 'PUT', headers: { AccessKey: key, 'Content-Type': contentType }, body: bytes as BodyInit })
      if (res.ok) return
      lastStatus = res.status
      if (res.status < 500 && res.status !== 429) break          // a rejection will not succeed on retry
    } catch {
      lastStatus = 'network error'
    }
    await new Promise(r => setTimeout(r, 400 * attempt))
  }
  console.error(`Bunny upload failed for ${path}: ${lastStatus}`)
  throw new StorageError('Upload failed. Please try again.', 502)
}
