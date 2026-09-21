// src/lib/chat-message-state.ts
//
// Pure helpers for the message list on the chat screen (no React, no network -
// which is what makes them unit-testable). They exist because the screen used
// to update its list in ways that could silently drop or duplicate messages:
//   - the "decrypt on key ready" step replaced the WHOLE list with a snapshot
//     taken earlier, wiping anything that arrived or was sent in between;
//   - an incoming message removed EVERY optimistic bubble with the same text;
//   - nothing re-synced after the phone slept or the connection dropped;
//   - a stale poll/refetch could roll a "read" message back to "sent".
// Every function returns a new array and never removes a message unless it is
// the one that confirms a still-pending optimistic bubble.

export interface ChatMsg {
  id: string
  body: string | null
  sender_id: string
  created_at: string
  is_deleted: boolean
  read_at: string | null
  /** Absent when the `delivered_at` column has not been migrated yet. */
  delivered_at?: string | null
  reply_to_id?: string | null
  /** Not confirmed by the server yet: either still sending, or failed. */
  _optimistic?: boolean
  /** Only meaningful together with _optimistic: the send did not go through. */
  _failed?: boolean
}

export type MessageStatus = 'sending' | 'failed' | 'sent' | 'delivered' | 'read'

function ms(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

function compareConfirmed(a: ChatMsg, b: ChatMsg): number {
  const d = ms(a.created_at) - ms(b.created_at)
  if (d !== 0) return d
  // Same millisecond (Date.parse drops microseconds): fall back to the raw
  // string, then the id, so the order is stable and identical on every device.
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Confirmed messages in time order (server timestamps), then any still-pending
 * optimistic bubbles at the end in the order they were sent. Optimistic ones use
 * the phone's clock, so they are never sorted among server-timestamped ones.
 */
export function arrange<T extends ChatMsg>(list: T[]): T[] {
  const confirmed = list.filter(m => !m._optimistic)
  const pending = list.filter(m => m._optimistic)
  confirmed.sort(compareConfirmed)
  return [...confirmed, ...pending]
}

/** A receipt timestamp never goes backwards: keep whichever side already has one. */
function keepReceipt(prev: string | null | undefined, next: string | null | undefined): string | null | undefined {
  return next ?? prev
}

/**
 * The still-pending (sending or failed) optimistic bubble that this incoming
 * server row is the echo of: same sender and the exact same wire body. Bodies
 * are compared as sent over the wire, so encrypted messages (random IV per send)
 * match one-to-one, and no decryption is needed to decide.
 */
export function findPendingMatch<T extends ChatMsg>(prev: T[], incoming: ChatMsg): T | undefined {
  if (incoming.body == null) return undefined
  return prev.find(m =>
    m._optimistic && m.sender_id === incoming.sender_id && m.body != null && m.body === incoming.body
  )
}

/**
 * A message arrived (realtime, refetch or poll). If we already have it, merge
 * it in place - never regressing read/delivered/deleted state; otherwise add it,
 * replacing the FIRST matching optimistic bubble if there is one.
 */
export function upsertIncoming<T extends ChatMsg>(prev: T[], incoming: T): T[] {
  const i = prev.findIndex(m => m.id === incoming.id)
  if (i >= 0) {
    const cur = prev[i]
    const deleted = cur.is_deleted || incoming.is_deleted
    const next = [...prev]
    next[i] = {
      ...cur,
      ...incoming,
      body: deleted ? null : incoming.body,
      is_deleted: deleted,
      read_at: keepReceipt(cur.read_at, incoming.read_at) ?? null,
      delivered_at: keepReceipt(cur.delivered_at, incoming.delivered_at),
      _optimistic: false,
      _failed: false,
    }
    return arrange(next)
  }
  const pending = findPendingMatch(prev, incoming)
  const base = pending ? prev.filter(m => m !== pending) : prev
  return arrange([...base, { ...incoming, _optimistic: false, _failed: false }])
}

/**
 * The server accepted an optimistic message and told us its real id (and
 * timestamp). If the realtime echo already replaced the bubble, this is a no-op.
 */
export function confirmOptimistic<T extends ChatMsg>(
  prev: T[], optimisticId: string, real: { id: string; created_at?: string | null }
): T[] {
  if (prev.some(m => m.id === real.id)) return prev.filter(m => m.id !== optimisticId)
  return arrange(prev.map(m =>
    m.id === optimisticId
      ? { ...m, id: real.id, created_at: real.created_at ?? m.created_at, _optimistic: false, _failed: false }
      : m
  ))
}

/** The send did not go through: keep the bubble so the person can retry. */
export function markFailed<T extends ChatMsg>(prev: T[], id: string): T[] {
  return prev.map(m => (m.id === id && m._optimistic ? { ...m, _failed: true } : m))
}

/** Retry pressed: back to "sending". */
export function markSending<T extends ChatMsg>(prev: T[], id: string): T[] {
  return prev.map(m => (m.id === id && m._optimistic ? { ...m, _failed: false } : m))
}

export function removeMessage<T extends ChatMsg>(prev: T[], id: string): T[] {
  return prev.filter(m => m.id !== id)
}

/**
 * Realtime UPDATE for a row we may already have: only receipts, deletion and
 * body can change. Unknown ids are ignored (the next sync will bring them).
 */
export function applyRowUpdate<T extends ChatMsg>(prev: T[], row: Partial<ChatMsg> & { id: string }): T[] {
  const i = prev.findIndex(m => m.id === row.id)
  if (i < 0) return prev
  const cur = prev[i]
  const deleted = cur.is_deleted || row.is_deleted === true
  const next = [...prev]
  next[i] = {
    ...cur,
    body: deleted ? null : (row.body !== undefined ? row.body : cur.body),
    is_deleted: deleted,
    read_at: keepReceipt(cur.read_at, row.read_at) ?? null,
    delivered_at: keepReceipt(cur.delivered_at, row.delivered_at),
  }
  return next
}

/**
 * Merge a freshly fetched page of messages (after the app was asleep or the
 * connection dropped). Adds what's missing, refreshes read/deleted state, and
 * keeps everything already on screen (the fetch only covers the latest page).
 */
export function mergeFetched<T extends ChatMsg>(prev: T[], fetched: T[]): T[] {
  return fetched.reduce((list, f) => upsertIncoming(list, f), prev)
}

/**
 * What to draw next to a message I sent.
 *   sending   - clock:            still on its way to the server
 *   failed    - red !:            the server did not accept it (tap to retry)
 *   sent      - one grey tick:    the server has it
 *   delivered - two grey ticks:   the recipient's app has received it
 *   read      - two brand ticks:  the recipient has opened it
 */
export function statusOf(m: ChatMsg): MessageStatus {
  if (m._optimistic) return m._failed ? 'failed' : 'sending'
  if (m.read_at) return 'read'
  if (m.delivered_at) return 'delivered'
  return 'sent'
}

// ── Date helpers (local time) ────────────────────────────────────────────────

export function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "Today", "Yesterday", a weekday within the last week, else "12 Sep" (+ year when not this year). */
export function dayLabel(iso: string, now: Date = new Date(), locale = 'en-NG'): string {
  const d = new Date(iso)
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString(locale, { weekday: 'long' })
  return d.toLocaleDateString(locale, {
    day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })
}
