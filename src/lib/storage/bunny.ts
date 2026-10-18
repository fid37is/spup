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

/**
 * The storage path behind one of our CDN addresses, or null for anything else
 * (an old Cloudinary link, another site, a path that tries to climb out of its folder).
 */
export function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url || !url.startsWith(MEDIA_CDN_URL + '/')) return null
  let path = url.slice(MEDIA_CDN_URL.length + 1).split(/[?#]/)[0]
  try { path = decodeURIComponent(path) } catch { return null }
  if (!path || path.includes('..') || path.startsWith('/')) return null
  return path
}

/** Removes a file from the storage zone. A file that is already gone counts as success; never throws. */
export async function deleteFromBunny(path: string): Promise<boolean> {
  const key = (process.env.BUNNY_STORAGE_ACCESS_KEY || '').trim()
  if (!key) { console.error('Bunny delete skipped: BUNNY_STORAGE_ACCESS_KEY is missing.'); return false }

  const url = `${BASE()}/${ZONE()}/${path.split('/').map(encodeURIComponent).join('/')}`
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { method: 'DELETE', headers: { AccessKey: key } })
      if (res.ok || res.status === 404) return true
      if (res.status < 500 && res.status !== 429) break
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 400 * attempt))
  }
  console.error(`Bunny delete failed for ${path}`)
  return false
}

export interface BunnyEntry { name: string; isDirectory: boolean; created: string; size: number }

/** Lists one folder of the storage zone (not recursive). Returns null if the listing failed, so callers never mistake a failure for an empty folder. */
export async function listBunny(path: string): Promise<BunnyEntry[] | null> {
  const key = (process.env.BUNNY_STORAGE_ACCESS_KEY || '').trim()
  if (!key) return null
  const url = `${BASE()}/${ZONE()}/${path.split('/').filter(Boolean).map(encodeURIComponent).join('/')}/`
  try {
    const res = await fetch(url, { headers: { AccessKey: key, Accept: 'application/json' } })
    if (res.status === 404) return []
    if (!res.ok) return null
    const rows = await res.json() as Array<{ ObjectName: string; IsDirectory: boolean; DateCreated: string; Length: number }>
    return rows.map(r => ({ name: r.ObjectName, isDirectory: !!r.IsDirectory, created: r.DateCreated, size: r.Length ?? 0 }))
  } catch {
    return null
  }
}
