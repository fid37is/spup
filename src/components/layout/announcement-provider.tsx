'use client'

// src/components/layout/announcement-provider.tsx
//
// Holds the announcement that should be on screen right now, and hands it to the
// three places that can show it (in-feed banner, pinned maintenance strip,
// desktop sidebar card - see components/feed/announcement-slots.tsx).
//
// It starts from what the server rendered (so there is no pop-in on load), then
// keeps itself current:
//   - a one-minute clock tick, so a dismissed banner comes back when its reminder
//     interval ends, and one that has passed its end time goes away, without any
//     network request;
//   - a re-check with the server every 5 minutes and whenever the app comes back to
//     the foreground, so a notice published mid-session appears without a reload.
// Dismissals are written to a cookie with the time they happened (lib/announcements).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  DISMISSED_COOKIE, parseDismissed, addDismissed, serializeDismissed, pickAnnouncement,
  type DismissedMap, type FeedAnnouncement,
} from '@/lib/announcements'

const TICK_MS = 60_000
const POLL_MS = 5 * 60_000
const MIN_GAP_MS = 60_000 // coming back to the app never re-checks more often than this

interface AnnouncementContextValue {
  announcement: FeedAnnouncement | null
  dismiss: (id: string) => void
}

const AnnouncementContext = createContext<AnnouncementContextValue>({ announcement: null, dismiss: () => {} })

export function useAnnouncement() {
  return useContext(AnnouncementContext)
}

function readDismissedCookie(): DismissedMap {
  const entry = document.cookie.split('; ').find(c => c.startsWith(`${DISMISSED_COOKIE}=`))
  return parseDismissed(entry?.slice(DISMISSED_COOKIE.length + 1))
}

function writeDismissedCookie(map: DismissedMap) {
  const secure = window.location.protocol === 'https:' ? '; secure' : ''
  document.cookie = `${DISMISSED_COOKIE}=${serializeDismissed(map)}; path=/; max-age=31536000; samesite=lax${secure}`
}

/** Both maps, keeping the later dismissal time for each id (another tab may have dismissed too). */
function mergeLatest(a: DismissedMap, b: DismissedMap): DismissedMap {
  const out = { ...a }
  for (const [id, at] of Object.entries(b)) out[id] = Math.max(out[id] ?? 0, at)
  return out
}

export default function AnnouncementProvider({
  initialRows,
  initialDismissed,
  initialNow,
  children,
}: {
  initialRows: FeedAnnouncement[]
  initialDismissed: DismissedMap
  /** The server's clock at render, so the first client render matches the server's. */
  initialNow: number
  children: React.ReactNode
}) {
  const [rows, setRows] = useState(initialRows)
  const [dismissed, setDismissed] = useState(initialDismissed)
  const [now, setNow] = useState(initialNow)
  const lastCheck = useRef(initialNow)

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    let stopped = false

    async function refresh() {
      lastCheck.current = Date.now()
      try {
        const res = await fetch('/api/announcements/live', { cache: 'no-store' })
        if (!res.ok || stopped) return
        const json = (await res.json()) as { rows?: FeedAnnouncement[] }
        if (stopped || !Array.isArray(json.rows)) return
        setRows(json.rows)
        setDismissed(prev => mergeLatest(readDismissedCookie(), prev))
        setNow(Date.now())
      } catch {
        // Offline or a hiccup: keep showing what we have.
      }
    }

    const poll = setInterval(refresh, POLL_MS)
    const onForeground = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current > MIN_GAP_MS) refresh()
    }
    // The layout (and so the rows it rendered) can be many minutes old on a phone: an
    // installed app or a restored tab never reloads, and some mobile webviews do not
    // fire visibilitychange on resume. So also check once on mount, and on focus /
    // pageshow (back-forward cache restore). All are rate-limited by MIN_GAP_MS, which
    // is measured from the server render, so a snapshot older than that is re-checked
    // straight away.
    onForeground()
    document.addEventListener('visibilitychange', onForeground)
    window.addEventListener('focus', onForeground)
    window.addEventListener('pageshow', onForeground)
    window.addEventListener('online', onForeground)
    return () => {
      stopped = true
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onForeground)
      window.removeEventListener('focus', onForeground)
      window.removeEventListener('pageshow', onForeground)
      window.removeEventListener('online', onForeground)
    }
  }, [])

  const dismiss = useCallback((id: string) => {
    const at = Date.now()
    const next = addDismissed(mergeLatest(readDismissedCookie(), dismissed), id, at)
    writeDismissedCookie(next)
    setDismissed(next)
    setNow(at)
  }, [dismissed])

  const announcement = useMemo(() => pickAnnouncement(rows, dismissed, now), [rows, dismissed, now])
  const value = useMemo(() => ({ announcement, dismiss }), [announcement, dismiss])

  return <AnnouncementContext.Provider value={value}>{children}</AnnouncementContext.Provider>
}
