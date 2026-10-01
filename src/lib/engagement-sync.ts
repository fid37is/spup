// src/lib/engagement-sync.ts
'use client'

/**
 * Likes and follows that survive a bad connection.
 *
 * The old flow sent the request straight from the button. On a weak network the
 * request could time out, never reach the server, or come back as an exception
 * that nothing caught - the button still showed "liked" but the server never
 * heard about it, so the next refresh showed the post unliked.
 *
 * Now a tap is saved first, then delivered:
 *   1. The tap is written to an outbox (memory + localStorage) and the screen
 *      updates instantly. It stays that way whatever the network does.
 *   2. A background sender delivers it to /api/engagement with a real timeout,
 *      and retries with backoff until the server confirms. It also retries the
 *      moment the phone comes back online or the app is reopened, and picks up
 *      anything left over from a previous visit.
 *   3. Requests carry the state wanted ("liked = true"), not "toggle", so a
 *      retry or a duplicate can never flip the result back.
 *   4. After the server confirms, the confirmed state keeps overriding the page
 *      data for a few minutes, so a stale feed (cached page, back navigation,
 *      slow refetch) can't show the old unliked state.
 * Only a definite "no" from the server (signed out, not allowed) undoes the tap
 * and shows an error.
 */

import { useEffect, useSyncExternalStore } from 'react'

export type EngagementKind = 'like' | 'follow'

interface Intent {
  desired: boolean   // what the person asked for: liked / following
  confirmed: boolean // the server acknowledged it
  ts: number         // when it was asked (unconfirmed) or confirmed
  attempts: number   // failed deliveries so far (drives the backoff)
  fails: number      // times the server itself answered with an error
  nextAt: number     // don't retry before this time
}

const STORAGE_KEY = 'spup:engagement:v1'
const CONFIRMED_TTL_MS = 10 * 60_000     // how long a confirmed tap overrides page data
const MAX_AGE_MS = 7 * 24 * 60 * 60_000  // stop trying after a week
const REQUEST_TIMEOUT_MS = 12_000
const BACKOFF_MS = [2_000, 5_000, 15_000, 30_000, 60_000]
const MAX_SERVER_FAILS = 6               // server answered with errors this many times: give up
const FOLLOW_PAUSE_KEY = 'spup:follow-paused-until'

const intents = new Map<string, Intent>()
const listeners = new Set<() => void>()
const failureListeners = new Set<(kind: EngagementKind, id: string, message?: string) => void>()
const inflight = new Set<string>()
let hydrated = false
let timer: ReturnType<typeof setTimeout> | null = null

const keyOf = (kind: EngagementKind, id: string) => `${kind}:${id}`

function hydrate() {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as Record<string, Intent>
    const now = Date.now()
    for (const [k, v] of Object.entries(saved)) {
      if (typeof v?.desired !== 'boolean') continue
      if (now - v.ts > (v.confirmed ? CONFIRMED_TTL_MS : MAX_AGE_MS)) continue
      intents.set(k, { ...v, nextAt: 0 })
    }
  } catch { /* corrupt or blocked storage: start clean */ }
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(intents)))
  } catch { /* private mode / full: still works in memory for this visit */ }
}

function emit() { listeners.forEach(l => l()) }

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

type Outcome = 'ok' | 'network' | 'server' | 'fatal' | 'follow_paused'
interface SendResult { outcome: Outcome; message?: string; pausedUntil?: number }

function pausedMessage(until: number) {
  const hours = Math.max(1, Math.ceil((until - Date.now()) / 3_600_000))
  return `You're following people too quickly, so following is paused for about ${hours} hour${hours === 1 ? '' : 's'}. Please try again later.`
}

function getFollowPausedUntil(): number {
  try {
    const v = Number(window.localStorage.getItem(FOLLOW_PAUSE_KEY))
    return Number.isFinite(v) && v > Date.now() ? v : 0
  } catch { return 0 }
}

function setFollowPausedUntil(until: number) {
  try { window.localStorage.setItem(FOLLOW_PAUSE_KEY, String(until)) } catch { /* private mode */ }
}

async function send(kind: EngagementKind, id: string, desired: boolean): Promise<SendResult> {
  const controller = new AbortController()
  const abortTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch('/api/engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id, desired }),
      keepalive: true,            // lets the request finish even if the tab is closing
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
    if (res.ok) {
      // A captive-portal / proxy page can answer 200 with HTML - only the
      // server's own JSON counts as confirmation.
      const data = await res.json().catch(() => null)
      return { outcome: data?.ok === true ? 'ok' : 'network' }
    }
    if (res.status === 429) {
      // The follow spam limit is a definite answer; any other 429 is just "slow down and retry"
      const data = await res.json().catch(() => null)
      if (data?.code === 'follow_paused') {
        const until = Date.parse(data.pausedUntil)
        return { outcome: 'follow_paused', message: data.error, pausedUntil: Number.isFinite(until) ? until : undefined }
      }
      return { outcome: 'server' }
    }
    if ([400, 401, 403, 404].includes(res.status)) {
      // A blocked follow is refused for good; its message is safe to show.
      const data = await res.json().catch(() => null)
      return { outcome: 'fatal', message: data?.code === 'follow_blocked' ? data.error : undefined }
    }
    return { outcome: 'server' }  // 5xx / gateway timeout on a weak link
  } catch {
    return { outcome: 'network' } // timeout, dropped connection, offline
  } finally {
    clearTimeout(abortTimer)
  }
}

async function deliver(k: string, it: Intent) {
  const sep = k.indexOf(':')
  const kind = k.slice(0, sep) as EngagementKind
  const id = k.slice(sep + 1)

  inflight.add(k)
  const { outcome, message, pausedUntil } = await send(kind, id, it.desired)
  inflight.delete(k)

  // The person changed their mind while this was in flight: the newer intent
  // is what matters, deliver that one next.
  if (intents.get(k) !== it) { scheduleFlush(0); return }

  if (outcome === 'ok') {
    intents.set(k, { ...it, confirmed: true, ts: Date.now(), attempts: 0, fails: 0 })
  } else if (outcome === 'follow_paused') {
    // Following is paused: undo this follow and every other follow still waiting
    // (they would all be refused), and tell the person once.
    setFollowPausedUntil(pausedUntil ?? Date.now() + 3 * 3_600_000)
    for (const [key, other] of [...intents.entries()]) {
      if (key.startsWith('follow:') && other.desired && !other.confirmed) intents.delete(key)
    }
    failureListeners.forEach(l => l(kind, id, message))
  } else {
    const fails = it.fails + (outcome === 'server' ? 1 : 0)
    if (outcome === 'fatal' || fails >= MAX_SERVER_FAILS) {
      intents.delete(k)
      failureListeners.forEach(l => l(kind, id, message))
    } else {
      const attempts = it.attempts + 1
      intents.set(k, {
        ...it, attempts, fails,
        nextAt: Date.now() + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)],
      })
    }
  }
  persist()
  emit()
}

function scheduleFlush(delay: number) {
  if (typeof window === 'undefined') return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { void flush() }, delay)
}

/** Deliver everything that is due. `force` ignores the backoff (used on reconnect / reopen). */
export async function flush(force = false) {
  hydrate()
  if (typeof window === 'undefined') return
  if (timer) { clearTimeout(timer); timer = null }
  if (!navigator.onLine) return // the 'online' event triggers a forced flush

  const now = Date.now()
  const due = [...intents.entries()].filter(
    ([k, it]) => !it.confirmed && !inflight.has(k) && (force || it.nextAt <= now),
  )
  await Promise.all(due.map(([k, it]) => deliver(k, it)))

  const waiting = [...intents.entries()].filter(([, it]) => !it.confirmed)
  if (waiting.length && !inflight.size) {
    const soonest = Math.min(...waiting.map(([, it]) => it.nextAt))
    scheduleFlush(Math.max(0, soonest - Date.now()))
  }
}

/** Record what the person asked for and deliver it in the background. */
export function setEngagement(kind: EngagementKind, id: string, desired: boolean) {
  hydrate()
  // Following is paused (spam limit): don't queue it - explain instead. Unfollowing is always allowed.
  if (kind === 'follow' && desired) {
    const pausedUntil = getFollowPausedUntil()
    if (pausedUntil) {
      failureListeners.forEach(l => l(kind, id, pausedMessage(pausedUntil)))
      return
    }
  }
  intents.set(keyOf(kind, id), { desired, confirmed: false, ts: Date.now(), attempts: 0, fails: 0, nextAt: 0 })
  persist()
  emit()
  void flush()
}

function drop(k: string) {
  if (intents.delete(k)) { persist(); emit() }
}

/**
 * The state to show. `serverValue` is what the page data says; a pending or
 * recently confirmed tap wins over it. `pending` is true while the tap is
 * still waiting for the server (nothing to show the user - it already looks done).
 */
export function useEngagement(kind: EngagementKind, id: string, serverValue: boolean) {
  const k = keyOf(kind, id)
  const intent = useSyncExternalStore(
    subscribe,
    () => { hydrate(); return intents.get(k) },
    () => undefined,
  )
  const expired = !!intent && intent.confirmed && Date.now() - intent.ts > CONFIRMED_TTL_MS
  const active = intent && !expired ? intent.desired : serverValue

  // Once the page data agrees with a confirmed tap (or the override is old),
  // stop overriding so fresh data from other devices can show through.
  useEffect(() => {
    if (intent?.confirmed && (intent.desired === serverValue || expired)) drop(k)
  }, [intent, serverValue, expired, k])

  return { active, pending: !!intent && !intent.confirmed }
}

/** Called when the server definitively refuses a tap (signed out, not allowed, follow spam pause). */
export function subscribeFailures(cb: (kind: EngagementKind, id: string, message?: string) => void) {
  failureListeners.add(cb)
  return () => { failureListeners.delete(cb) }
}

/** Mount once: delivers leftovers from earlier visits and retries on reconnect / reopen. */
export function startEngagementSync() {
  hydrate()
  const onOnline = () => { void flush(true) }
  const onVisible = () => { if (document.visibilityState === 'visible') void flush(true) }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  void flush(true)
  return () => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
  }
}