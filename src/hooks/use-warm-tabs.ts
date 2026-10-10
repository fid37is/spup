'use client'

import { useEffect, useState } from 'react'

/**
 * True once the app has finished loading, the phone is idle, and the connection
 * is good enough to do work nobody asked for yet.
 *
 * The main tabs (Explore, Alerts, Chat, ...) are passed `prefetch` only once this
 * flips on, so their pages - data included - are fetched in the background and
 * are already waiting when the person taps, instead of starting a load then.
 *
 * It stays OFF (the links keep Next's default light prefetch) when:
 *  - Data Saver is on,
 *  - the connection is anything below 4G (Chrome/Android report this; on slow
 *    internet a background download would compete with what the person is
 *    actually looking at),
 *  - the device is offline.
 * Safari has no connection API, so it counts as good.
 */
export function useWarmTabs(): boolean {
  const [warm, setWarm] = useState(false)

  useEffect(() => {
    const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    if (conn?.saveData) return
    if (conn?.effectiveType && conn.effectiveType !== '4g') return
    if (typeof navigator.onLine === 'boolean' && !navigator.onLine) return

    let cancelled = false
    let idleId: number | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const go = () => { if (!cancelled) setWarm(true) }
    const schedule = () => {
      if ('requestIdleCallback' in window) idleId = window.requestIdleCallback(go, { timeout: 4000 })
      else timer = setTimeout(go, 2500)
    }

    if (document.readyState === 'complete') schedule()
    else window.addEventListener('load', schedule, { once: true })

    return () => {
      cancelled = true
      window.removeEventListener('load', schedule)
      if (idleId !== undefined && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId)
      if (timer) clearTimeout(timer)
    }
  }, [])

  return warm
}
