// src/lib/media-client.ts
//
// Browser-only helpers that make uploads cheaper on slow connections:
//   - compressImageForUpload: phone photos are routinely 3-8MB; the server
//     caps them at 1200px wide anyway, so shrinking first sends a fraction
//     of the bytes and loses nothing visible.
//   - createUploadQueue: with several photos per post, starting every
//     upload at once makes each one crawl (and decoding several big photos at
//     once can run a low-end phone out of memory). Run a few at a time.

// Longest side kept before upload. The server keeps up to 1600px (see
// /api/upload/signature), so this is below that ceiling and nothing is cut twice.
//
// WebP is used when the browser can encode it: at the same visual quality it is
// roughly 25-35% smaller than JPEG, so the extra pixels (1440 vs the old 1280) and
// the higher quality setting cost no more upload data than before. Browsers that
// can't encode WebP (Safari on older iOS) get the previous JPEG settings unchanged.
const WEBP_MAX_DIMENSION = 1440
const WEBP_QUALITY = 0.86
const JPEG_MAX_DIMENSION = 1280
const JPEG_QUALITY = 0.82
// Below this a photo isn't worth re-encoding (and every re-encode loses a little).
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

let webpSupport: boolean | null = null
function canEncodeWebp(): boolean {
  if (webpSupport !== null) return webpSupport
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    webpSupport = c.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    webpSupport = false
  }
  return webpSupport
}

/**
 * Resizes with proper filtering. One big jump (e.g. 4000px -> 1440px) makes the
 * browser skip pixels and look jagged; halving until close, then a last high-quality
 * draw to the exact size, keeps fine detail (text, faces, hair) clean at no byte cost.
 */
function drawScaled(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement | null {
  let cw = img.naturalWidth
  let ch = img.naturalHeight
  let source: CanvasImageSource = img
  while (cw / 2 >= w && ch / 2 >= h) {
    const step = document.createElement('canvas')
    step.width = Math.round(cw / 2)
    step.height = Math.round(ch / 2)
    const sctx = step.getContext('2d')
    if (!sctx) return null
    sctx.imageSmoothingEnabled = true
    sctx.imageSmoothingQuality = 'high'
    sctx.drawImage(source, 0, 0, step.width, step.height)
    source = step
    cw = step.width
    ch = step.height
  }
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) return null
  // JPEG/WebP-from-PNG: paint white first so transparent PNGs don't turn black.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  return out
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

    const webp = canEncodeWebp()
    const maxDim = webp ? WEBP_MAX_DIMENSION : JPEG_MAX_DIMENSION
    const scale = Math.min(1, maxDim / Math.max(w, h))
    const canvas = drawScaled(img, Math.round(w * scale), Math.round(h * scale))
    if (!canvas) return file

    const mime = webp ? 'image/webp' : 'image/jpeg'
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, mime, webp ? WEBP_QUALITY : JPEG_QUALITY))
    // Some browsers silently hand back PNG when they can't encode the asked-for type.
    if (!blob || blob.type !== mime || blob.size >= file.size) return file

    const baseName = file.name.replace(/\.[^./\\]+$/, '') || 'photo'
    return new File([blob], `${baseName}.${webp ? 'webp' : 'jpg'}`, { type: mime, lastModified: Date.now() })
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