'use client'

/**
 * Three-state connectivity signal for the app: 'online' | 'degraded' | 'offline'.
 *
 * navigator.onLine only tells you whether a network interface exists at
 * all - it stays true on a slow/flaky connection, which is exactly the
 * case product wants distinguished from real disconnection. There's no
 * cross-browser way to read actual link quality directly (the Network
 * Information API's navigator.connection only exists on Chrome/Android -
 * Safari/iOS has nothing), so 'degraded' is inferred by periodically
 * probing a tiny same-origin endpoint and watching for timeouts/failures
 * while navigator.onLine is still true.
 */

import { createContext, useContext, useEffect, useRef, useState } from 'react'

export type NetworkStatus = 'online' | 'degraded' | 'offline'

interface NetworkStatusContextValue {
  status: NetworkStatus
  isOnline: boolean    // status !== 'offline' (degraded still counts as "online" for this)
  isDegraded: boolean
  isOffline: boolean
}

const NetworkStatusContext = createContext<NetworkStatusContextValue>({
  status: 'online', isOnline: true, isDegraded: false, isOffline: false,
})

export function useNetworkStatus() {
  return useContext(NetworkStatusContext)
}

const PROBE_INTERVAL_MS = 20_000   // how often to check while idle
const PROBE_TIMEOUT_MS = 5_000     // a probe slower than this counts as "slow"
const SLOW_STREAK_TO_DEGRADE = 2   // consecutive slow/failed probes before flagging degraded
const FAST_TO_RECOVER = 1          // a single fast probe is enough to clear "degraded"

export function NetworkStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<NetworkStatus>('online')
  const slowStreak = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    async function probe() {
      // The device's own signal is authoritative for true disconnection -
      // trust it before spending a network round trip.
      if (!navigator.onLine) {
        slowStreak.current = 0
        setStatus('offline')
        return
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
      const started = performance.now()
      let slow: boolean
      try {
        const res = await fetch('/api/health', { cache: 'no-store', signal: controller.signal })
        slow = !res.ok || (performance.now() - started) > PROBE_TIMEOUT_MS
      } catch {
        // Aborted (timeout) or a network-level failure while onLine is
        // still true - a dropped packet or an overloaded mobile tower,
        // not "no internet". This is the actual "degraded" signal.
        slow = true
      } finally {
        clearTimeout(timeout)
      }

      slowStreak.current = slow ? slowStreak.current + 1 : 0

      if (!navigator.onLine) { setStatus('offline'); return }
      if (slowStreak.current >= SLOW_STREAK_TO_DEGRADE) { setStatus('degraded'); return }
      if (slowStreak.current === 0) { setStatus('online'); return }
      // A single slow probe is ambiguous (could be a one-off blip) -
      // hold the current status rather than flapping.
    }

    function handleOffline() {
      slowStreak.current = 0
      setStatus('offline')
    }
    function handleOnline() {
      // Coming back from a real disconnect - assume good until the next
      // probe says otherwise, rather than jumping straight to "degraded".
      slowStreak.current = 0
      setStatus('online')
      void probe()
    }

    // Network Information API - Chrome/Android only, but when present it's
    // an instant signal instead of waiting for the next probe cycle.
    const connection = (navigator as any).connection
    function handleConnectionChange() {
      if (!connection || !navigator.onLine) return
      if (connection.saveData || ['slow-2g', '2g'].includes(connection.effectiveType)) {
        slowStreak.current = Math.max(slowStreak.current, SLOW_STREAK_TO_DEGRADE)
        setStatus('degraded')
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    connection?.addEventListener?.('change', handleConnectionChange)

    if (!navigator.onLine) setStatus('offline')
    void probe()
    intervalRef.current = setInterval(probe, PROBE_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      connection?.removeEventListener?.('change', handleConnectionChange)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const value: NetworkStatusContextValue = {
    status,
    isOnline: status !== 'offline',
    isDegraded: status === 'degraded',
    isOffline: status === 'offline',
  }

  return (
    <NetworkStatusContext.Provider value={value}>
      {children}
    </NetworkStatusContext.Provider>
  )
}
