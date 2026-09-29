// src/lib/engagement-state.ts
//
// Shared, instant like/repost state per post.
//
// The same post can be on screen more than once at the same time - most obviously
// the feed card AND the full-screen media viewer's sidebar sitting on top of it.
// If each PostActions kept its own private state, liking in one would leave the
// other showing "not liked" until a refresh, and people tap again thinking it
// didn't work. So a tap is recorded here, and every PostActions for that post
// reads from it.
//
// This holds only the person's *own pending intent* (an override). What the
// server last said still comes in through the post's props, and the displayed
// state is: override if there is one, else the server's. The override is dropped
// as soon as the server's snapshot agrees with it, or has moved on from where it
// was when the person tapped (server truth wins). Counts are derived by callers as
// serverCount +/- 1 depending on whether the displayed state differs from the
// server's, so they stay right whether or not a fresh snapshot has arrived.

import { useSyncExternalStore } from 'react'

export type EngagementKind = 'like' | 'repost'

export interface EngagementEntry {
  /** What the person most recently asked for. */
  active: boolean
  /** The server's state for this post when they first tapped. */
  baseline: boolean
  /** Requests started but not finished. */
  inFlight: number
  /** Increments per tap, so a failing older request can't undo a newer tap. */
  seq: number
}

const entries = new Map<string, EngagementEntry>()
const listeners = new Set<() => void>()
const keyOf = (kind: EngagementKind, postId: string) => `${kind}:${postId}`
function emit() { listeners.forEach(l => l()) }
function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

// Entries are replaced, never mutated, so getSnapshot's identity only changes
// when something actually changed (required by useSyncExternalStore).
export function useEngagementOverride(kind: EngagementKind, postId: string): EngagementEntry | undefined {
  return useSyncExternalStore(
    subscribe,
    () => entries.get(keyOf(kind, postId)),
    () => undefined
  )
}

/**
 * A tap. Records the wanted state immediately (every instance for this post
 * updates in the same render) and returns a ticket for endEngagement.
 * `serverActive` is the server's current state as this instance sees it.
 */
export function beginEngagement(kind: EngagementKind, postId: string, active: boolean, serverActive: boolean): number {
  const k = keyOf(kind, postId)
  const prev = entries.get(k)
  const seq = (prev?.seq ?? 0) + 1
  entries.set(k, {
    active,
    baseline: prev ? prev.baseline : serverActive,
    inFlight: (prev?.inFlight ?? 0) + 1,
    seq,
  })
  emit()
  return seq
}

/**
 * The request finished. If it failed pass `undoTo` (the state before the tap):
 * it is applied only if no newer tap has happened since.
 */
export function endEngagement(kind: EngagementKind, postId: string, seq: number, undoTo?: boolean) {
  const k = keyOf(kind, postId)
  const cur = entries.get(k)
  if (!cur) return
  const superseded = cur.seq !== seq
  entries.set(k, {
    ...cur,
    active: !superseded && undoTo !== undefined ? undoTo : cur.active,
    inFlight: Math.max(0, cur.inFlight - 1),
  })
  emit()
}

/**
 * Drop the override once the server's snapshot has caught up with it, or has
 * changed on its own (another device) - and nothing of ours is still pending.
 */
export function settleEngagement(kind: EngagementKind, postId: string, serverActive: boolean) {
  const k = keyOf(kind, postId)
  const cur = entries.get(k)
  if (!cur || cur.inFlight > 0) return
  if (cur.active === serverActive || serverActive !== cur.baseline) {
    entries.delete(k)
    emit()
  }
}
