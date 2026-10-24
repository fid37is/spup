// src/lib/share-link.ts
//
// Opens the phone's share sheet for a link (WhatsApp, Instagram, SMS, ...). Used for profiles and
// posts. Best option first:
//   1. Android app    window.SpupNative.share (MainActivity) - the real system share sheet. The
//                     Android WebView has no Web Share API.
//   2. Web Share API  iOS / Android browsers, installed PWAs.
//   3. Copy the link  desktop browsers, or an older APK without SpupNative.share.

export type ShareResult = 'shared' | 'copied' | 'cancelled'

type SpupNativeShare = { share?: (title: string, text: string, url: string) => boolean }

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through to the legacy route */ }
  try {
    // Older WebViews / non-secure contexts.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

/**
 * 'shared'    - handed to the system share sheet
 * 'copied'    - no share sheet on this device; the link was copied instead
 * 'cancelled' - the person closed the share sheet
 * Throws only when nothing worked (no share sheet and no clipboard).
 */
export async function shareLink(opts: { title: string; text: string; url: string }): Promise<ShareResult> {
  const bridge = (window as unknown as { SpupNative?: SpupNativeShare }).SpupNative
  if (bridge && typeof bridge.share === 'function') {
    try {
      if (bridge.share(opts.title, opts.text, opts.url)) return 'shared'
    } catch { /* fall through */ }
  }

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url })
      return 'shared'
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled'
      // Refused for another reason (not a secure context, etc.) - copy instead.
    }
  }

  if (await copyText(opts.url)) return 'copied'
  throw new Error('share unavailable')
}
