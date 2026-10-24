// src/lib/share-profile.ts
//
// Sharing a profile out of the app (WhatsApp, Instagram, SMS, ...).
//
// What gets shared is the PUBLIC page, /u/<username>, not the in-app /user/<username>:
//   - it opens for people who don't have Spup (no login wall), and
//   - it carries the Open Graph tags (name, bio, avatar), so WhatsApp / Telegram / X show
//     a proper preview card instead of a bare link.
// The in-app address redirects there for signed-out visitors anyway, but crawlers that
// build the preview card don't always follow that redirect.
//
// How it opens, best first:
//   1. Android app    window.SpupNative.share (MainActivity) - the real system share sheet.
//                     The Android WebView has no Web Share API, which is why "Share" used to
//                     silently turn into "copy link" inside the app.
//   2. Web Share API  iOS / Android browsers, installed PWAs.
//   3. Copy the link  desktop browsers, or an older APK without SpupNative.share.

export type ShareResult = 'shared' | 'copied' | 'cancelled'

type SpupNativeShare = { share?: (title: string, text: string, url: string) => boolean }

export function profileShareUrl(username: string): string {
  return `${window.location.origin}/u/${encodeURIComponent(username)}`
}

async function copyText(text: string): Promise<boolean> {
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
 * Opens the share sheet for a profile.
 *   'shared'    - handed to the system share sheet
 *   'copied'    - no share sheet on this device; the link was copied instead
 *   'cancelled' - the person closed the share sheet
 * Throws only when nothing worked (no share sheet and no clipboard).
 */
export async function shareProfile(
  profile: { username: string; displayName?: string | null },
  copy: { title: string; text: string },   // already translated by the caller
): Promise<ShareResult> {
  const url = profileShareUrl(profile.username)

  // 1. Android app.
  const bridge = (window as unknown as { SpupNative?: SpupNativeShare }).SpupNative
  if (bridge && typeof bridge.share === 'function') {
    try {
      if (bridge.share(copy.title, copy.text, url)) return 'shared'
    } catch { /* fall through */ }
  }

  // 2. Web Share API.
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: copy.title, text: copy.text, url })
      return 'shared'
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled'
      // Refused for another reason (not a secure context, etc.) - copy instead.
    }
  }

  // 3. Copy the link.
  if (await copyText(url)) return 'copied'
  throw new Error('share unavailable')
}

/** Copies the profile link without opening a share sheet. Throws if the clipboard is unavailable. */
export async function copyProfileLink(username: string): Promise<void> {
  if (!(await copyText(profileShareUrl(username)))) throw new Error('copy unavailable')
}
