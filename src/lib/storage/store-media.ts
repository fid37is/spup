// src/lib/storage/store-media.ts
//
// The one place that turns an uploaded file into a stored file: checks it really is what
// it claims to be, works out its size, picks its path in the account's own folder, and
// writes it to Bunny. Used by both upload routes (/api/upload and /api/upload/bunny).
//
// Cloudinary used to do the resizing and the checking on its side. Now:
//   - photos are already shrunk in the browser (lib/media-client.ts) and avatars /
//     banners are cropped there (components/profile/crop-modal.tsx);
//   - resizing for display is done by Bunny Optimizer (?width=N, see utils/cloudinary.ts);
//   - this file does the checking, so nothing can be stored under our domain that is not
//     a genuine photo or video of an allowed type and size.

import {
  ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES,
  MAX_IMAGE_LABEL, MAX_VIDEO_LABEL,
} from '../media-limits'
import { accountFolder } from '../media-config'
import { imageSize } from '../image-size'
import { putToBunny, publicUrl, StorageError } from './bunny'

export type StoreKind = 'image' | 'video' | 'avatar' | 'banner' | 'poster'

export const MAX_VIDEO_SECONDS = 180
export const MAX_POSTER_BYTES = 2 * 1024 * 1024

export interface StoredMedia {
  url: string
  thumbnail_url: null
  media_type: 'image' | 'video'
  width: number | null
  height: number | null
  duration_secs: number | null
  size_bytes: number
  /** Kept under this name so the rest of the app (post schema, composer, validation) needs no change: it is the file's path in the storage zone. */
  cloudinary_id: string
}

export const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/mov': 'mov', 'video/avi': 'avi',
}

const startsWith = (b: Uint8Array, ...bytes: number[]) => bytes.every((v, i) => b[i] === v)
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to))

/** Do the first bytes of the file match the type it claims to be? */
function looksLike(mime: string, b: Uint8Array): boolean {
  switch (mime) {
    case 'image/jpeg': return startsWith(b, 0xff, 0xd8, 0xff)
    case 'image/png': return startsWith(b, 0x89, 0x50, 0x4e, 0x47)
    case 'image/gif': return ascii(b, 0, 4) === 'GIF8'
    case 'image/webp': return ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP'
    case 'video/mp4': case 'video/quicktime': case 'video/mov': return ascii(b, 4, 8) === 'ftyp'
    case 'video/webm': return startsWith(b, 0x1a, 0x45, 0xdf, 0xa3)
    case 'video/avi': return ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'AVI '
    default: return false
  }
}

const int = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null
}

export interface StoreInput {
  /** users.id of the person uploading (their own folder). */
  profileId: string
  kind: StoreKind
  mime: string
  bytes: Uint8Array
  /** For videos the browser reads these from the file; the server cannot decode video. */
  hint?: { width?: unknown; height?: unknown; duration?: unknown }
}

export async function storeMedia({ profileId, kind, mime, bytes, hint }: StoreInput): Promise<StoredMedia> {
  const isVideo = kind === 'video'
  const allowed = isVideo ? ALLOWED_VIDEO_TYPES : ALLOWED_IMAGE_TYPES
  if (!allowed.includes(mime)) {
    throw new StorageError(`File type ${mime || 'unknown'} not allowed. Use JPEG, PNG, GIF, WebP, MP4, MOV or WebM.`, 400)
  }
  const max = kind === 'poster' ? MAX_POSTER_BYTES : isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
  if (bytes.byteLength > max) {
    const label = kind === 'poster' ? '2MB' : isVideo ? MAX_VIDEO_LABEL : MAX_IMAGE_LABEL
    throw new StorageError(`File too large. Maximum size is ${label}.`, 400)
  }
  if (bytes.byteLength === 0 || !looksLike(mime, bytes)) {
    throw new StorageError('That file does not look like a valid photo or video.', 400)
  }

  let width: number | null = null
  let height: number | null = null
  let duration: number | null = null
  if (isVideo) {
    width = int(hint?.width, 1, 10000)
    height = int(hint?.height, 1, 10000)
    duration = int(hint?.duration, 0, MAX_VIDEO_SECONDS + 5)
  } else {
    const size = imageSize(bytes)
    if (!size) throw new StorageError('That image could not be read.', 400)
    width = size.width
    height = size.height
  }

  const area = kind === 'avatar' || kind === 'banner' ? 'profile' : 'posts'
  const ext = EXT_BY_MIME[mime]
  // Avatars and banners are named by time (as before); everything else gets a random name.
  const name = area === 'profile'
    ? `${kind}_${Date.now()}`
    : crypto.randomUUID().replace(/-/g, '')
  const path = `${accountFolder(profileId, area)}/${name}.${ext}`

  await putToBunny(path, bytes, mime)

  return {
    url: publicUrl(path),
    thumbnail_url: null,
    media_type: isVideo ? 'video' : 'image',
    width, height,
    duration_secs: isVideo ? duration : null,
    size_bytes: bytes.byteLength,
    cloudinary_id: path,
  }
}
