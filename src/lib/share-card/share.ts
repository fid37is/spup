// src/lib/share-card/share.ts
//
// Shares a post or a profile as a CARD: the picture drawn by draw.ts goes out through the phone's
// share sheet with the link underneath it as the caption. In WhatsApp that is the card, with a
// tappable spup.live link beneath it.
//
// How the picture gets to the share sheet, best first:
//   1. Android app    window.SpupNative.shareImage (MainActivity) - the system share sheet with the
//                     picture attached. The Android WebView can't share files itself.
//   2. Web Share API  with the picture as a file - iOS, Android browsers, installed PWAs.
//   3. The link only  desktop browsers, an older APK without shareImage, or if drawing fails.
//                     The link still opens the post / profile on Spup (see share-link.ts).

import { shareLink, type ShareResult } from '@/lib/share-link'
import type { ShareCardInput } from './draw'

type SpupNativeImage = { shareImage?: (base64Png: string, text: string, title: string) => boolean }

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** 'unsupported' = this device can't send a picture to a share sheet; use the link instead. */
async function shareImageFile(blob: Blob, opts: { filename: string; title: string; text: string }): Promise<ShareResult | 'unsupported'> {
  const bridge = (window as unknown as { SpupNative?: SpupNativeImage }).SpupNative
  if (bridge && typeof bridge.shareImage === 'function') {
    try {
      if (bridge.shareImage(await blobToBase64(blob), opts.text, opts.title)) return 'shared'
    } catch { /* fall through */ }
  }

  try {
    const file = new File([blob], opts.filename, { type: 'image/png' })
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: opts.title, text: opts.text })
      return 'shared'
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return 'cancelled'
    // Refused for another reason - fall through to the link.
  }
  return 'unsupported'
}

/**
 * Draws the card for `input` and shares it with `url` as the caption.
 *   'shared' / 'cancelled' - went through the share sheet
 *   'copied'               - no share sheet: the link was copied
 * Throws only when nothing worked.
 */
export async function shareCard(
  input: ShareCardInput,
  opts: { url: string; title: string; filename: string },
): Promise<ShareResult> {
  const caption = `${opts.title}\n${opts.url}`
  try {
    // Loaded on demand: the drawing code and the Spup mark aren't needed until someone shares.
    const { drawShareCard } = await import('./draw')
    const blob = await drawShareCard(input)
    const result = await shareImageFile(blob, { filename: opts.filename, title: opts.title, text: caption })
    if (result !== 'unsupported') return result
  } catch (err) {
    console.warn('[share-card] could not share the picture, sharing the link instead', err)
  }
  return shareLink({ title: opts.title, text: opts.title, url: opts.url })
}
