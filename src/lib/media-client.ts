// src/lib/media-client.ts
//
// Browser-only helpers that make uploads cheaper on slow connections:
//   - compressImageForUpload: phone photos are routinely 3-8MB; the server
//     caps them at 1200px wide anyway, so shrinking first sends a fraction
//     of the bytes and loses nothing visible.
//   - createUploadQueue: with several photos per post, starting every
//     upload at once makes each one crawl (and decoding several big photos at
//     once can run a low-end phone out of memory). Run a few at a time.

// Slightly above the 1200px the server keeps, so nothing visible is lost.
const MAX_DIMENSION = 1280
const JPEG_QUALITY = 0.82
// Below this a photo isn't worth re-encoding.
const SKIP_BELOW_BYTES = 300 * 1024

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')) }
    img.src = url
  })
}

/**
 * Returns a smaller JPEG version of `file`, or the original if it can't
 * (or needn't) be shrunk. Never throws - compression is an optimisation,
 * so any failure just falls back to uploading the original.
 * GIFs are left alone (a canvas would flatten the animation).
 */
export async function compressImageForUpload(file: File): Promise<File> {
  try {
    if (typeof window === 'undefined') return file
    if (file.type === 'image/gif' || file.size <= SKIP_BELOW_BYTES) return file

    const img = await loadImage(file)
    const { naturalWidth: w, naturalHeight: h } = img
    if (!w || !h) return file

    const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    // JPEG has no transparency - paint white first so transparent PNGs
    // don't turn black.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob || blob.size >= file.size) return file

    const baseName = file.name.replace(/\.[^./\\]+$/, '') || 'photo'
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}

/** Runs async tasks with at most `limit` in flight; the rest wait their turn. */
export function createUploadQueue(limit = 3) {
  let active = 0
  const waiting: Array<() => void> = []

  const next = () => {
    active--
    const start = waiting.shift()
    if (start) start()
  }

  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active++
        task().then(resolve, reject).finally(next)
      }
      if (active < limit) start()
      else waiting.push(start)
    })
  }
}
