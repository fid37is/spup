'use client'

import { useEffect } from 'react'
import { recordActivityAction } from '@/lib/actions/analytics'

// Tells the server "this person is here" - at most once every 30 minutes per
// device - so the admin Insights page can show active users, devices and
// locations. It waits until the browser is idle so it can never slow down the
// first paint, which matters on slow connections.

const STORAGE_KEY = 'spup:activity-ping'
const EVERY_MS = 30 * 60 * 1000

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  cancelIdleCallback?: (id: number) => void
  Capacitor?: { isNativePlatform?: () => boolean }
}

export default function ActivityBeacon() {
  useEffect(() => {
    const w = window as IdleWindow

    let last = 0
    try { last = Number(localStorage.getItem(STORAGE_KEY) ?? 0) } catch { /* private mode */ }
    if (Date.now() - last < EVERY_MS) return

    const isNativeApp = !!w.Capacitor?.isNativePlatform?.()
    const isInstalledPwa =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    const mode = isNativeApp ? 'app' : isInstalledPwa ? 'pwa' : 'browser'

    const send = () => {
      recordActivityAction(mode)
        .then(r => {
          if (r?.ok) { try { localStorage.setItem(STORAGE_KEY, String(Date.now())) } catch { /* ignore */ } }
        })
        .catch(() => { /* offline - try again next visit */ })
    }

    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(send, { timeout: 8000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = setTimeout(send, 4000)
    return () => clearTimeout(t)
  }, [])

  return null
}
