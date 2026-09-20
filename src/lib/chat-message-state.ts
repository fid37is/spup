// src/lib/chat-message-state.ts
//
// Pure helpers for the message list on the chat screen. They exist because the
// screen used to update its list in ways that could silently drop messages:
//   - the "decrypt on key ready" step replaced the WHOLE list with a snapshot
//     taken earlier, wiping anything that arrived or was sent in between;
//   - an incoming message removed EVERY optimistic bubble with the same text
//     (send "ok" twice quickly and one vanished until it was echoed back);
//   - nothing re-synced after the phone slept or the connection dropped.
// Every function returns a new array and never removes a message unless it is
// the one that confirms a still-pending optimistic bubble.

export interface ChatMsg {
  id: string
  body: string | null
  sender_id: string
  created_at: string
  is_deleted: boolean
  read_at: string | null
  _plaintext?: string
  _optimistic?: boolean
}

/**
 * Confirmed messages in time order (server timestamps), then any still-pending
 * optimistic bubbles at the end in the order they were sent. Optimistic ones use
 * the phone's clock, so they are never sorted among server-timestamped ones.
 */
export function arrange<T extends ChatMsg>(list: T[]): T[] {
  const confirmed = list.filter(m => !m._optimistic)
  const pending = list.filter(m => m._optimistic)
  confirmed.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
  return [...confirmed, ...pending]
}

/**
 * A message arrived (realtime or refetch). If we already have it, update it in
 * place (keeping its decrypted text); otherwise add it, replacing the FIRST
 * matching optimistic bubble (same sender, same text) if there is one.
 */
export function upsertIncoming<T extends ChatMsg>(prev: T[], incoming: T): T[] {
  const i = prev.findIndex(m => m.id === incoming.id)
  if (i >= 0) {
    const next = [...prev]
    next[i] = {
      ...prev[i], ...incoming,
      _plaintext: incoming._plaintext ?? prev[i]._plaintext,
      _optimistic: false,
    }
    return arrange(next)
  }
  const pendingIdx = prev.findIndex(m =>
    m._optimistic && m.sender_id === incoming.sender_id &&
    m._plaintext !== undefined && m._plaintext === incoming._plaintext
  )
  const base = pendingIdx >= 0 ? prev.filter((_, idx) => idx !== pendingIdx) : prev
  return arrange([...base, { ...incoming, _optimistic: false }])
}

/** The server accepted an optimistic message and told us its real id. */
export function confirmOptimistic<T extends ChatMsg>(prev: T[], optimisticId: string, realId: string): T[] {
  if (prev.some(m => m.id === realId)) return prev.filter(m => m.id !== optimisticId)
  return arrange(prev.map(m => (m.id === optimisticId ? { ...m, id: realId, _optimistic: false } : m)))
}

/** Store decrypted text by message id, touching nothing else in the list. */
export function applyPlaintexts<T extends ChatMsg>(prev: T[], texts: Map<string, string | undefined>): T[] {
  return prev.map(m => (texts.has(m.id) ? { ...m, _plaintext: texts.get(m.id) } : m))
}

/**
 * Merge a freshly fetched page of messages (after the app was asleep or the
 * connection dropped). Adds what's missing, refreshes read/deleted state, and
 * keeps everything already on screen (the fetch only covers the latest page).
 */
export function mergeFetched<T extends ChatMsg>(prev: T[], fetched: T[]): T[] {
  return fetched.reduce((list, f) => upsertIncoming(list, f), prev)
}
