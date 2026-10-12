// src/lib/save-media.ts
//
// Saving and sharing a photo/video from the full-screen media viewers (feed posts
// and chat messages). Everything is hosted on Cloudinary, so there is nothing to
// upload or re-encode - these helpers only decide HOW the file gets to the device.
//
//   Web / installed PWA  : fetch the file, hand it to the browser as a download
//                          (with a real filename). If the fetch is blocked, open
//                          the Cloudinary "attachment" URL instead.
//   Android app          : the WebView ignores <a download>, so the app saves the
//                          file itself. MainActivity exposes window.SpupNative.saveMedia,
//                          which downloads it straight into the gallery (Pictures/Spup
//                          or Movies/Spup) with no browser trip, and reports back with
//                          a "spup:media-saved" event. That needs the APK built with
//                          the updated MainActivity; an older APK, or Android 9 and
//                          under, falls back to opening Cloudinary's `fl_attachment`
//                          URL in the system browser (@capacitor/browser), where
//                          Chrome saves it to Downloads with its own notification.
//
// Sharing uses the Web Share API (the file itself where the device allows it, the
// link otherwise) and falls back to copying the link.

import { isNativeApp } from '@/lib/native'

export type MediaKind = 'image' | 'video'

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
}

/**
 * Cloudinary URL that the server answers with `Content-Disposition: attachment`,
 * so a browser saves it instead of displaying it. Any other URL comes back unchanged.
 */
export function attachmentUrl(url: string): string {
  if (!url.includes('res.cloudinary.com')) return url
  const marker = url.includes('/image/upload/') ? '/image/upload/'
    : url.includes('/video/upload/') ? '/video/upload/'
      : null
  if (!marker) return url
  if (/\/upload\/[^/]*fl_attachment/.test(url)) return url
  return url.replace(marker, `${marker}fl_attachment/`)
}

/** A sensible filename for the saved file: the URL's own name, with an extension that matches the data. */
function fileNameFor(url: string, kind: MediaKind, mime?: string): string {
  let base = ''
  try {
    base = decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
  } catch { /* fall through to the generic name */ }
  base = base.replace(/[^\w.\-]+/g, '_')
  const hasExt = /\.[a-z0-9]{2,5}$/i.test(base)
  const ext = (mime && EXT_BY_MIME[mime]) || (kind === 'video' ? 'mp4' : 'jpg')
  if (!base) return `spup-${Date.now()}.${ext}`
  return hasExt ? base : `${base}.${ext}`
}

const APP_SAVE_EVENT = 'spup:media-saved'
const APP_SAVE_TIMEOUT_MS = 120_000   // a long video on a slow connection

type SpupNativeBridge = { saveMedia?: (url: string, kind: string, requestId: string) => boolean }

/**
 * Android app: has MainActivity download the file into the gallery.
 *   true  - saved
 *   false - the app can't do it (older APK without saveMedia, Android 9 or under): use the fallback
 * Throws if the save was started and then failed.
 */
function saveViaApp(url: string, kind: MediaKind): Promise<boolean> {
  const bridge = (window as unknown as { SpupNative?: SpupNativeBridge }).SpupNative
  if (!bridge || typeof bridge.saveMedia !== 'function') return Promise.resolve(false)

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return new Promise<boolean>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); window.removeEventListener(APP_SAVE_EVENT, onDone) }
    const onDone = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; ok: boolean }>).detail
      if (!detail || detail.id !== id) return
      cleanup()
      if (detail.ok) resolve(true)
      else reject(new Error('save failed'))
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error('save timed out')) }, APP_SAVE_TIMEOUT_MS)
    window.addEventListener(APP_SAVE_EVENT, onDone)

    let started = false
    try { started = bridge.saveMedia!(url, kind, id) } catch { started = false }
    if (!started) { cleanup(); resolve(false) }
  })
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
  if (!res.ok) throw new Error(`fetch failed (${res.status})`)
  return res.blob()
}

/**
 * Saves the media to the device.
 *   'saved'  - the file is on the device: handed to the browser (web), or written to
 *              the gallery by the Android app
 *   'opened' - the file was opened for download in the system browser (Android app
 *              fallback for an older APK / Android 9 and under)
 * Throws if neither route worked, so the caller can show an error.
 */
export async function saveMediaToDevice(url: string, kind: MediaKind): Promise<'saved' | 'opened'> {
  if (isNativeApp()) {
    if (await saveViaApp(url, kind)) return 'saved'
    // Older APK or Android 9 and under: let the system browser download it.
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url: attachmentUrl(url) })
    return 'opened'
  }

  try {
    const blob = await fetchBlob(url)
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = fileNameFor(url, kind, blob.type)
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Give the browser a moment to start reading the blob before releasing it.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
    return 'saved'
  } catch {
    // Most likely blocked by CORS. The Cloudinary attachment URL still downloads.
    const opened = window.open(attachmentUrl(url), '_blank', 'noopener')
    if (!opened) throw new Error('save failed')
    return 'opened'
  }
}

export interface ShareMediaOptions {
  title?: string
  text?: string
  /** Page to share when the file itself can't be shared (a post link, say). Defaults to the media URL. */
  link?: string
}

/**
 * Opens the system share sheet.
 *   'shared'    - handed to the share sheet
 *   'copied'    - no share sheet on this device; the link was copied instead
 *   'cancelled' - the person closed the share sheet
 * Throws only if nothing worked (no share sheet and no clipboard).
 */
export async function shareMedia(url: string, kind: MediaKind, opts: ShareMediaOptions = {}): Promise<'shared' | 'copied' | 'cancelled'> {
  const link = opts.link ?? url
  const nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined

  if (nav?.share) {
    // 1. The file itself, where the device allows sharing files.
    try {
      if (nav.canShare) {
        const blob = await fetchBlob(url)
        const file = new File([blob], fileNameFor(url, kind, blob.type), { type: blob.type })
        if (nav.canShare({ files: [file] })) {
          await nav.share({ files: [file], title: opts.title, text: opts.text })
          return 'shared'
        }
      }
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled'
      // fetch blocked, or the browser refused the file - fall through to the link
    }
    // 2. The link.
    try {
      await nav.share({ title: opts.title, text: opts.text, url: link })
      return 'shared'
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled'
    }
  }

  // 3. No share sheet (desktop browsers, the Android WebView): copy the link.
  if (nav?.clipboard?.writeText) {
    await nav.clipboard.writeText(link)
    return 'copied'
  }
  throw new Error('share unavailable')
}