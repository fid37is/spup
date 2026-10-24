// src/lib/offline-cache.ts
//
// Talks to the service worker (public/sw.js) about the pages it keeps on the device.

function post(message: Record<string, unknown>) {
  try {
    const sw = navigator.serviceWorker
    if (!sw) return
    if (sw.controller) { sw.controller.postMessage(message); return }
    // First visit: the worker is installed but doesn't control this page yet.
    void sw.ready.then(reg => reg.active?.postMessage(message)).catch(() => {})
  } catch { /* no service worker (dev, old browser) - nothing to tell */ }
}

/** Drop every saved page. Used when the account is removed from this device. */
export function clearOfflineCaches() {
  post({ type: 'spup:clear-caches' })
}

/**
 * Tell the worker whose account the saved pages belong to. If it is somebody else from the
 * last time, the worker discards the old person's pages.
 */
export function rememberSignedInUser(userId: string) {
  post({ type: 'spup:user', userId })
}

/**
 * The app's own code, styles and fonts that were loaded before the worker took over the page
 * (the very first visit) were never saved by it. List them so it can save them now - without
 * this the app would start offline on the second visit but not after the first.
 */
export function saveLoadedStaticFiles() {
  try {
    const urls = performance
      .getEntriesByType('resource')
      .map(e => e.name)
      .filter(n => n.startsWith(`${location.origin}/_next/static/`))
    if (urls.length) post({ type: 'spup:cache-urls', urls: Array.from(new Set(urls)).slice(0, 250) })
  } catch { /* performance API unavailable */ }
}

/**
 * On /feed the service worker may have opened the app from its saved copy (a quick return) and
 * fetched the real page in the background. Ask whether that page has arrived; if it did,
 * `onUpdated` runs so the page can re-render and let the feed raise its "N new posts" pill.
 */
export function onSavedFeedUpdated(onUpdated: () => void) {
  try {
    const ctrl = navigator.serviceWorker?.controller
    if (!ctrl) return
    const channel = new MessageChannel()
    channel.port1.onmessage = (e: MessageEvent) => {
      channel.port1.close()
      if (e.data === 'updated') onUpdated()
    }
    ctrl.postMessage({ type: 'spup:feed-check' }, [channel.port2])
  } catch { /* no service worker - the page came straight from the server */ }
}
