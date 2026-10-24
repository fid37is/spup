'use client'

// src/components/layout/offline-sync.tsx
//
// Companion to public/sw.js. With no connection the app shows the last copy
// of each page it saved. This makes sure that copy never lingers once the internet is
// back: the moment the device is online again (or the app returns to the foreground
// while online) the page on screen is re-fetched from the server - network-first in
// the service worker - so what you see is current, not stale.
//
// It also keeps the service worker informed (see lib/offline-cache.ts):
//   - who is signed in, so pages saved for a different account are never shown, and
//   - which app files this page already loaded, so the app starts offline from the 2nd visit
//     on rather than the 3rd.
//
// It only refreshes when there is a reason to think the screen is a saved copy:
//   - the app was opened with no connection, or the connection dropped while open
//   - the service worker said it had to serve a saved copy (slow / failed request)
// So a normal always-online session never triggers a refresh.

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { rememberSignedInUser, saveLoadedStaticFiles, onSavedFeedUpdated } from '@/lib/offline-cache'

export default function OfflineSync({ userId }: { userId: string }) {
  const router = useRouter()
  const maybeStale = useRef(false)
  const busy = useRef(false)

  // Who the saved pages belong to.
  useEffect(() => { rememberSignedInUser(userId) }, [userId])

  // Opened on /feed from the saved copy? Once the real page has arrived, re-render so the feed
  // can put whatever is newer behind its pill (it never swaps the list under the reader).
  useEffect(() => {
    if (window.location.pathname !== '/feed') return
    onSavedFeedUpdated(() => router.refresh())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save the app files this page loaded before the service worker was in charge of it.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = () => { timer = setTimeout(saveLoadedStaticFiles, 1500) }
    if (document.readyState === 'complete') run()
    else window.addEventListener('load', run, { once: true })
    return () => { if (timer) clearTimeout(timer); window.removeEventListener('load', run) }
  }, [])

  useEffect(() => {
    if (!navigator.onLine) maybeStale.current = true

    async function refreshIfNeeded() {
      if (!maybeStale.current || busy.current) return
      if (!navigator.onLine || document.visibilityState !== 'visible') return
      busy.current = true
      try {
        // Make sure the connection really works before asking Next to re-render.
        const res = await fetch('/api/health', { cache: 'no-store' })
        if (res.ok) {
          maybeStale.current = false
          router.refresh()
        }
      } catch { /* still not reachable - try again on the next online/visible event */ }
      finally { busy.current = false }
    }

    const onOffline = () => { maybeStale.current = true }
    const onMessage = (e: MessageEvent) => { if (e.data?.type === 'spup:stale') maybeStale.current = true }

    window.addEventListener('offline', onOffline)
    window.addEventListener('online', refreshIfNeeded)
    document.addEventListener('visibilitychange', refreshIfNeeded)
    navigator.serviceWorker?.addEventListener('message', onMessage)
    // Opened offline, and the connection came back before we mounted its listener.
    void refreshIfNeeded()

    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', refreshIfNeeded)
      document.removeEventListener('visibilitychange', refreshIfNeeded)
      navigator.serviceWorker?.removeEventListener('message', onMessage)
    }
  }, [router])

  return null
}
