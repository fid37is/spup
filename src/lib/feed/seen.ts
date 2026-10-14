// src/lib/feed/seen.ts
// ─── Served-post history for the For You feed ────────────────────────────────
// Facebook, X and Threads all do the same two things so a refresh never shows
// the same page again:
//   1. They remember which posts they already SERVED to this person and push
//      those below everything not yet served (they are demoted, not deleted -
//      once the unserved posts run out, the older ones come back).
//   2. They add a little per-session randomness to the ranking so equally good
//      posts don't always land in the same order.
//
// This file holds the pure pieces both the server and the browser need. The
// history lives in a small cookie (read by the server when it renders /feed,
// written by the browser as posts are loaded), so no database change is needed.
//
// Posts are tracked by the LAST 8 characters of their id: that part is random
// for both UUIDv4 and time-ordered UUIDv7 ids (the first part of a v7 id is a
// timestamp, so a prefix would collide), and 8 hex chars keeps the cookie small.

export const SEEN_COOKIE = 'spup_feed_served'
export const SEEN_MAX = 200                 // most recent served posts remembered
export const SEEN_MAX_AGE_S = 24 * 60 * 60  // forget after a day - old posts should be able to come back

export function shortPostId(id: string): string {
  return id.replace(/-/g, '').slice(-8).toLowerCase()
}

/** Cookie value -> list of short ids, most recent first. Tolerates junk. */
export function parseSeenCookie(raw: string | undefined | null): string[] {
  if (!raw) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const part of raw.split('.')) {
    if (!/^[0-9a-f]{4,16}$/.test(part) || seen.has(part)) continue
    seen.add(part)
    out.push(part)
    if (out.length >= SEEN_MAX) break
  }
  return out
}

export function serializeSeen(ids: string[]): string {
  return ids.slice(0, SEEN_MAX).join('.')
}

/**
 * Record posts as served. Ids already remembered stay where they are; new ones go
 * to the front with the one served LAST first, so when the cap trims the list it
 * drops the oldest. Returns the same array (same reference) when nothing is new,
 * so callers can skip a write.
 */
export function addServed(current: string[], posts: Array<{ id: string; is_promoted?: boolean }>): string[] {
  const have = new Set(current)
  const add: string[] = []
  for (const p of posts) {
    if (p.is_promoted) continue
    const id = shortPostId(p.id)
    if (have.has(id)) continue
    have.add(id)
    add.push(id)
  }
  if (!add.length) return current
  return [...add.reverse(), ...current].slice(0, SEEN_MAX)
}

/** Fresh random seed for one feed session (one open / one refresh). */
export function makeSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Stable 0..1 value for (seed, post) - same inputs always give the same number. */
export function seededUnit(seed: string, id: string): number {
  let h = 2166136261
  const s = `${seed}:${id}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

/** What a feed session carries: frozen for its whole life so page 2, 3... line up with page 1. */
export type FeedSession = { seed: string; seen: string[] }