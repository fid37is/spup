// src/lib/media-limits.ts
//
// Single source of truth for post-media limits. Imported by the composers
// (client), the upload API route and the post schema (server) so the numbers
// can never drift apart again. Nothing in here touches browser APIs, so it is
// safe to import from server code.
//
// The limits are deliberately tight: most of Spup's users are on slow
// mobile connections, where a large upload is the most common way a post
// fails.

/** Max media items in one post (photos + video combined). */
export const MAX_MEDIA_PER_POST = 4

/** Of those, at most this many can be videos. */
export const MAX_VIDEOS_PER_POST = 2

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB per photo
/** Everything in one post together - photos + videos (photos measured after in-browser compression). */
export const MAX_POST_MEDIA_BYTES = 25 * 1024 * 1024 // 25MB per post
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024 // 25MB per video

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/mov', 'video/avi']

export type MediaKind = 'image' | 'video'

const MB = 1024 * 1024
export const MAX_POST_MEDIA_LABEL = `${MAX_POST_MEDIA_BYTES / MB}MB`
export const MAX_IMAGE_LABEL = `${MAX_IMAGE_BYTES / MB}MB`
export const MAX_VIDEO_LABEL = `${MAX_VIDEO_BYTES / MB}MB`

export function mediaKindOf(file: { type: string }): MediaKind | null {
  if (ALLOWED_IMAGE_TYPES.includes(file.type)) return 'image'
  if (ALLOWED_VIDEO_TYPES.includes(file.type)) return 'video'
  return null
}

/** Type + size check for one file. Returns a user-facing message, or null if fine. */
export function validateMediaFile(file: { type: string; size: number; name?: string }): string | null {
  const kind = mediaKindOf(file)
  if (!kind) {
    return `${file.type || 'This file type'} isn't supported. Use JPEG, PNG, GIF or WebP photos, or an MP4, MOV or WebM video.`
  }
  if (kind === 'video' && file.size > MAX_VIDEO_BYTES) {
    return `Video is too large. Maximum size is ${MAX_VIDEO_LABEL}.`
  }
  if (kind === 'image' && file.size > MAX_IMAGE_BYTES) {
    return `Photo is too large. Maximum size is ${MAX_IMAGE_LABEL}.`
  }
  return null
}

/**
 * Decides which of the picked files can be added to a post that already has
 * `existing` items. Files that fail a check are skipped; the first problem
 * found comes back as `error` so the composer can show one clear message.
 */
export function selectFilesForPost<T extends { type: string; size: number }>(
  existing: MediaKind[],
  files: T[],
): { accepted: T[]; error: string | null } {
  const kinds = [...existing]
  const accepted: T[] = []
  let error: string | null = null

  for (const file of files) {
    const fileError = validateMediaFile(file)
    if (fileError) { if (!error) error = fileError; continue }

    const kind = mediaKindOf(file) as MediaKind
    if (kinds.length >= MAX_MEDIA_PER_POST) {
      if (!error) error = `You can add up to ${MAX_MEDIA_PER_POST} images per post.`
      continue
    }
    if (kind === 'video' && kinds.filter(k => k === 'video').length >= MAX_VIDEOS_PER_POST) {
      if (!error) error = `Only ${MAX_VIDEOS_PER_POST} videos per post.`
      continue
    }
    kinds.push(kind)
    accepted.push(file)
  }
  return { accepted, error }
}

/** Total bytes of all media (photos + videos) in a post. */
export function totalMediaBytes(items: { size_bytes?: number | null }[]): number {
  return items.reduce((sum, i) => sum + (i.size_bytes ?? 0), 0)
}

export const POST_MEDIA_TOO_BIG = `Everything in one post can total ${MAX_POST_MEDIA_LABEL} at most. Remove something or pick smaller files.`
