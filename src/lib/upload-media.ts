/**
 * Direct-to-Cloudinary media upload, built for slow/flaky connections
 * (this app's userbase is mostly on Nigerian mobile networks, where a
 * multi-minute upload dropping partway through is the normal case, not
 * an edge case). Used by both the compose box and reply composer.
 *
 * Client-side type/size checks below are a fast first line of defense (no
 * point spending someone's slow, possibly-metered data on a doomed upload),
 * not the real enforcement boundary - since the browser now talks to
 * Cloudinary directly instead of through our own API route, hard limits on
 * file size/format/duration should also be configured on the Cloudinary
 * account/upload preset itself (dashboard-only setting, can't be done from
 * here) so a client that skips these checks can't bypass them.
 */

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/mov', 'video/avi', 'video/webm', 'video/quicktime']
const MAX_IMAGE_SIZE = 10 * 1024 * 1024   // 10MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024  // 100MB

const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 1500
// Generous ceilings, not a "this should take this long" estimate - just a
// backstop so a genuinely hung connection eventually surfaces an error
// with a retry option, instead of spinning forever with no feedback.
const VIDEO_TIMEOUT_MS = 6 * 60 * 1000
const IMAGE_TIMEOUT_MS = 2 * 60 * 1000

export interface UploadResult {
  url: string
  thumbnail_url: string | null
  media_type: 'image' | 'video'
  width: number | null
  height: number | null
  duration_secs: number | null
  size_bytes: number
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
    return `File too large. Maximum size is ${isVideo ? '100MB' : '10MB'}.`
  }
  return null
}

/** Cloudinary can derive a still frame from any uploaded video purely via a
 * URL transform (so_0 = the frame at 0 seconds) - no processing job, no
 * wait, works the instant the video itself finishes uploading. */
function deriveVideoThumbnail(secureUrl: string): string {
  return secureUrl.replace('/upload/', '/upload/so_0/').replace(/\.\w+$/, '.jpg')
}

async function getSignature(type: UploadKind) {
  const res = await fetch('/api/upload/signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || 'Could not start upload')
  return data as {
    signature: string; timestamp: number; api_key: string; cloud_name: string
    folder: string; transformation: string; public_id: string | null; resource_type: 'image' | 'video'
  }
}

function xhrUploadOnce(
  file: File,
  sig: Awaited<ReturnType<typeof getSignature>>,
  onProgress: (pct: number) => void,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const url = `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${sig.resource_type}/upload`

    xhr.open('POST', url)
    xhr.timeout = timeoutMs

    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) resolve(data)
        else reject(new Error(data?.error?.message || `Upload failed (${xhr.status})`))
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

    const form = new FormData()
    form.append('file', file)
    form.append('api_key', sig.api_key)
    form.append('timestamp', String(sig.timestamp))
    form.append('signature', sig.signature)
    form.append('folder', sig.folder)
    form.append('transformation', sig.transformation)
    if (sig.public_id) form.append('public_id', sig.public_id)

    xhr.send(form)
  })
}

/**
 * Uploads a file directly to Cloudinary with real progress and automatic
 * retry. Retries only network-level failures/timeouts (a fast, flaky, or
 * momentarily-dropped connection) - never a validation error from
 * Cloudinary itself, since that won't succeed on retry.
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
  const sig = await getSignature(kind)

  let lastError: Error | null = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new UploadCancelledError('Upload cancelled')
    try {
      if (attempt > 0) onProgress?.(0)
      const result = await xhrUploadOnce(file, sig, pct => onProgress?.(pct), timeoutMs, signal)
      const isVideoResult = kind === 'video'
      return {
        url: result.secure_url as string,
        thumbnail_url: isVideoResult ? deriveVideoThumbnail(result.secure_url as string) : null,
        media_type: isVideoResult ? 'video' : 'image',
        width: (result.width as number) ?? null,
        height: (result.height as number) ?? null,
        duration_secs: isVideoResult ? Math.round((result.duration as number) || 0) : null,
        size_bytes: file.size,
        cloudinary_id: result.public_id as string,
      }
    } catch (err) {
      if (err instanceof UploadCancelledError) throw err
      lastError = err instanceof Error ? err : new Error('Upload failed')
      // Only NETWORK-tagged failures (see xhrUploadOnce) are worth retrying -
      // a Cloudinary-side validation rejection will just fail the same way
      // again immediately, wasting the user's data for nothing.
      if (lastError.message !== 'NETWORK' || attempt === MAX_RETRIES) break
      await new Promise(r => setTimeout(r, RETRY_BASE_DELAY_MS * (attempt + 1)))
    }
  }

  throw new Error(
    lastError?.message === 'NETWORK'
      ? 'Upload failed - your connection dropped. Tap to retry.'
      : (lastError?.message || 'Upload failed')
  )
}