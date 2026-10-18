/**
 * Media upload for the compose box, reply composer and chat, built for slow/flaky
 * connections (this app's userbase is mostly on Nigerian mobile networks, where a
 * multi-minute upload dropping partway through is the normal case, not an edge case).
 *
 * The browser asks /api/upload/sign for a signed address and sends the file straight to the
 * Bunny Edge Script (edge/upload-edge-script.js), which checks it and writes it to bunny.net
 * storage - so a video never passes through Vercel, whose 4.5MB request limit would block it.
 * Where direct uploads are not set up it falls back to /api/upload/bunny (through the server).
 * The file is sent as the raw request body so progress is real, and a dropped connection is
 * retried automatically.
 *
 * What Cloudinary used to do on its side is done here instead:
 *   - the video's size and length are read in the browser (and videos over 3 minutes
 *     are refused, where Cloudinary used to trim them);
 *   - a poster frame is taken from the video in the browser and uploaded with it.
 * Photos are shrunk before they get here (lib/media-client.ts), and resized for display
 * by Bunny Optimizer (lib/utils/cloudinary.ts).
 *
 * Client-side type/size checks below are a fast first line of defense (no point
 * spending someone's slow, possibly-metered data on a doomed upload); the server
 * route re-checks everything.
 */

import {
  ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES,
  MAX_IMAGE_BYTES as MAX_IMAGE_SIZE, MAX_VIDEO_BYTES as MAX_VIDEO_SIZE,
  MAX_IMAGE_LABEL, MAX_VIDEO_LABEL,
} from '@/lib/media-limits'

const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 1500
// Generous ceilings, not a "this should take this long" estimate - just a
// backstop so a genuinely hung connection eventually surfaces an error
// with a retry option, instead of spinning forever with no feedback.
const VIDEO_TIMEOUT_MS = 6 * 60 * 1000
const IMAGE_TIMEOUT_MS = 2 * 60 * 1000

const MAX_VIDEO_SECONDS = 180
const POSTER_MAX_WIDTH = 720

export interface UploadResult {
  url: string
  thumbnail_url: string | null
  media_type: 'image' | 'video'
  width: number | null
  height: number | null
  duration_secs: number | null
  size_bytes: number
  /** The file's path in the storage zone (para/<account>/posts/<name>). Name kept from the Cloudinary days so the post schema and composer did not need to change. */
  cloudinary_id: string
}

export type UploadKind = 'image' | 'video' | 'avatar' | 'banner'

export class UploadCancelledError extends Error {}

function validateFile(file: File, kind: UploadKind): string | null {
  const isVideo = kind === 'video'
  const isImage = kind === 'image' || kind === 'avatar' || kind === 'banner'
  if (isVideo && !ALLOWED_VIDEO_TYPES.includes(file.type)) {
    return `File type ${file.type || 'unknown'} not allowed. Use MP4, MOV, WebM, or AVI.`
  }
  if (isImage && !ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return `File type ${file.type || 'unknown'} not allowed. Use JPEG, PNG, GIF, or WebP.`
  }
  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
  if (file.size > maxSize) {
    return `File too large. Maximum size is ${isVideo ? MAX_VIDEO_LABEL : MAX_IMAGE_LABEL}.`
  }
  return null
}

interface VideoInfo {
  width: number
  height: number
  duration: number
  /** First frame as a JPEG, or null if the browser could not draw one. */
  poster: Blob | null
}

/**
 * Reads a video's size and length, and grabs its first frame, entirely in the browser
 * (the file is not uploaded or fully loaded for this). Returns null when the browser
 * cannot read the file at all (an unsupported codec, say); the upload then goes ahead
 * without a size, length or poster.
 */
function probeVideo(file: File): Promise<VideoInfo | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'

    let info: Omit<VideoInfo, 'poster'> | null = null
    let done = false
    const finish = (poster: Blob | null) => {
      if (done) return
      done = true
      clearTimeout(hardTimeout)
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
      resolve(info ? { ...info, poster } : null)
    }
    const hardTimeout = setTimeout(() => finish(null), 8000)

    video.onerror = () => finish(null)
    video.onloadedmetadata = () => {
      if (!video.videoWidth || !video.videoHeight) return finish(null)
      info = { width: video.videoWidth, height: video.videoHeight, duration: video.duration }
      // Seek a hair in: some browsers (iOS) only decode a frame once asked to seek.
      video.currentTime = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(0.05, video.duration / 2) : 0
    }
    video.onseeked = () => {
      try {
        const w = Math.min(POSTER_MAX_WIDTH, video.videoWidth)
        const h = Math.round(video.videoHeight * (w / video.videoWidth))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')?.drawImage(video, 0, 0, w, h)
        canvas.toBlob(blob => finish(blob), 'image/jpeg', 0.8)
      } catch {
        finish(null)
      }
    }
    video.src = url
  })
}

/** Sends `body` to the upload route as the raw request body, with real progress. */
function xhrUploadOnce(
  endpoint: string,
  body: Blob,
  mime: string,
  onProgress: ((pct: number) => void) | null,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ media: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', endpoint)
    xhr.setRequestHeader('Content-Type', mime)
    xhr.timeout = timeoutMs

    if (onProgress) {
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300 && data?.media) resolve(data)
        else reject(new Error(data?.error || `Upload failed (${xhr.status})`))
      } catch {
        reject(new Error('Upload failed - could not read response'))
      }
    }
    xhr.onerror = () => reject(new Error('NETWORK'))
    xhr.ontimeout = () => reject(new Error('NETWORK'))
    xhr.onabort = () => reject(new UploadCancelledError('Upload cancelled'))

    if (signal) {
      if (signal.aborted) { xhr.abort(); return }
      signal.addEventListener('abort', () => xhr.abort())
    }
    xhr.send(body)
  })
}

/** Photo size, read in the browser (direct uploads skip the server, which used to read it). */
function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null) }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

/** Sends `body` to `url` with PUT, with real progress. Used for the direct-to-Bunny upload. */
function xhrPutOnce(
  url: string,
  body: Blob,
  mime: string,
  onProgress: ((pct: number) => void) | null,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', mime)
    xhr.timeout = timeoutMs
    if (onProgress) {
      xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      let message = ''
      try { message = JSON.parse(xhr.responseText)?.error || '' } catch { /* not JSON */ }
      // 5xx from the edge is worth another try; anything else is a refusal that will repeat.
      reject(new Error(xhr.status >= 500 ? 'NETWORK' : (message || `Upload failed (${xhr.status})`)))
    }
    xhr.onerror = () => reject(new Error('NETWORK'))
    xhr.ontimeout = () => reject(new Error('NETWORK'))
    xhr.onabort = () => reject(new UploadCancelledError('Upload cancelled'))
    if (signal) {
      if (signal.aborted) { xhr.abort(); return }
      signal.addEventListener('abort', () => xhr.abort())
    }
    xhr.send(body)
  })
}

/**
 * Sends one file to storage and returns its record.
 *  1. Asks /api/upload/sign for a signed address (direct upload, no size limit from Vercel).
 *  2. Sends the file straight there. The file never passes through the Spup server.
 * If direct uploads are not set up (sign answers direct:false), or this is an avatar/banner,
 * it uses the old route through the server (`fallbackEndpoint`) exactly as before.
 */
async function sendFile(
  kind: UploadKind | 'poster',
  body: Blob,
  mime: string,
  hints: { w?: number | null; h?: number | null; d?: number | null },
  fallbackEndpoint: string,
  onProgress: ((pct: number) => void) | null,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ media: Record<string, unknown> }> {
  if (kind === 'image' || kind === 'video' || kind === 'poster') {
    let sign: { direct?: boolean; uploadUrl?: string; media?: Record<string, unknown>; error?: string } | null = null
    try {
      const res = await fetch('/api/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, mime, size: body.size, w: hints.w ?? undefined, h: hints.h ?? undefined, d: hints.d ?? undefined }),
        signal,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`)
      sign = data
    } catch (err) {
      if (signal?.aborted) throw new UploadCancelledError('Upload cancelled')
      // fetch() itself failing is a dropped connection (retryable); a refusal carries its own message.
      throw err instanceof TypeError ? new Error('NETWORK') : err
    }
    if (sign?.direct && sign.uploadUrl && sign.media) {
      await xhrPutOnce(sign.uploadUrl, body, mime, onProgress, timeoutMs, signal)
      return { media: sign.media }
    }
  }
  return xhrUploadOnce(fallbackEndpoint, body, mime, onProgress, timeoutMs, signal)
}

/**
 * Uploads a file with real progress and automatic retry. Retries only network-level
 * failures/timeouts (a fast, flaky, or momentarily-dropped connection) - never a
 * rejection from the server itself, since that won't succeed on retry.
 */
export async function uploadMedia(
  file: File,
  kind: UploadKind,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  const validationError = validateFile(file, kind)
  if (validationError) throw new Error(validationError)

  const isVideo = kind === 'video'
  const timeoutMs = isVideo ? VIDEO_TIMEOUT_MS : IMAGE_TIMEOUT_MS

  // Videos: read size / length / first frame once, before the upload (not per retry).
  const video = isVideo ? await probeVideo(file) : null
  if (video && Number.isFinite(video.duration) && video.duration > MAX_VIDEO_SECONDS + 1) {
    throw new Error('Videos can be up to 3 minutes long. Please trim it and try again.')
  }

  const query = new URLSearchParams({ kind })
  if (video) {
    query.set('w', String(video.width))
    query.set('h', String(video.height))
    if (Number.isFinite(video.duration)) query.set('d', String(Math.round(video.duration)))
  }
  const endpoint = `/api/upload/bunny?${query.toString()}`
  const imageSize = kind === 'image' ? await readImageSize(file) : null
  const hints = video
    ? { w: video.width, h: video.height, d: Number.isFinite(video.duration) ? Math.round(video.duration) : null }
    : { w: imageSize?.width ?? null, h: imageSize?.height ?? null }

  let lastError: Error | null = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new UploadCancelledError('Upload cancelled')
    try {
      if (attempt > 0) onProgress?.(0)
      const { media } = await sendFile(kind, file, file.type, hints, endpoint, pct => onProgress?.(pct), timeoutMs, signal)

      // The poster is a small extra file. If it fails the post still goes ahead: the
      // player just shows the video's own first frame.
      let thumbnail: string | null = null
      if (isVideo && video?.poster) {
        try {
          const poster = await sendFile('poster', video.poster, 'image/jpeg', {}, '/api/upload/bunny?kind=poster', null, IMAGE_TIMEOUT_MS, signal)
          thumbnail = (poster.media.url as string) ?? null
        } catch (err) {
          if (err instanceof UploadCancelledError) throw err
        }
      }

      return {
        url: media.url as string,
        thumbnail_url: thumbnail,
        media_type: isVideo ? 'video' : 'image',
        width: (media.width as number | null) ?? null,
        height: (media.height as number | null) ?? null,
        duration_secs: isVideo
          ? (video && Number.isFinite(video.duration) ? Math.round(video.duration) : (media.duration_secs as number | null) ?? null)
          : null,
        size_bytes: file.size,
        cloudinary_id: media.cloudinary_id as string,
      }
    } catch (err) {
      if (err instanceof UploadCancelledError) throw err
      lastError = err instanceof Error ? err : new Error('Upload failed')
      // Only NETWORK-tagged failures (see xhrUploadOnce) are worth retrying -
      // a server-side rejection will just fail the same way again immediately,
      // wasting the user's data for nothing.
      if (lastError.message !== 'NETWORK' || attempt === MAX_RETRIES) break
      await new Promise(r => setTimeout(r, RETRY_BASE_DELAY_MS * (attempt + 1)))
    }
  }

  throw new Error(
    lastError?.message === 'NETWORK'
      ? 'Upload failed - your connection dropped. Please try again.'
      : (lastError?.message || 'Upload failed')
  )
}
