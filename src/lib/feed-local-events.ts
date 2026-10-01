// src/lib/feed-local-events.ts
//
// Tiny in-page event bus so a repost made from ANY card can reach the feed
// that is mounted on the same page.
//
// The feed's realtime channel deliberately ignores the person's own inserts
// ("already added locally"), but nothing added a repost locally - so your own
// repost never showed up until a full refresh. PostActions publishes here and
// FeedClient listens: an added repost is queued behind the "new posts" pill with
// the post already in hand (no extra fetch), and an undone repost is removed.
//
// Anywhere no feed is mounted (profile, post page) there is simply no listener.
//
// It also carries 'post-created': posts are now sent in the background (see
// components/layout/posting-provider), so a new post of yours finishes long
// after the composer has closed. The poster publishes the finished post here.

import type { FeedPost } from '@/lib/actions/feed'

export type FeedLocalEvent =
  | { type: 'repost-added'; post: FeedPost }
  | { type: 'repost-removed'; originalId: string }
  | { type: 'post-created'; post: FeedPost }

type Listener = (e: FeedLocalEvent) => void
const listeners = new Set<Listener>()

/** Returns how many listeners received it (0 = no feed is mounted right now). */
export function publishFeedEvent(e: FeedLocalEvent): number {
  listeners.forEach(l => l(e))
  return listeners.size
}

// A post that finished while no feed was mounted (the person already left for
// another page): park it so the feed can show it at the top when it next opens.
// Short-lived on purpose - an old entry could outlive the post itself.
const JUST_POSTED_KEY = 'spup:just-posted'
const JUST_POSTED_TTL_MS = 2 * 60 * 1000

export function stashJustPosted(post: unknown) {
  try { sessionStorage.setItem(JUST_POSTED_KEY, JSON.stringify({ post, at: Date.now() })) } catch { /* private mode */ }
}

/** Returns the parked post (once) if it is still fresh, otherwise null. */
export function takeJustPosted(): FeedPost | null {
  try {
    const raw = sessionStorage.getItem(JUST_POSTED_KEY)
    if (!raw) return null
    sessionStorage.removeItem(JUST_POSTED_KEY)
    const parsed = JSON.parse(raw) as { post?: FeedPost; at?: number } | null
    if (!parsed?.post?.id || typeof parsed.at !== 'number') return null
    if (Date.now() - parsed.at > JUST_POSTED_TTL_MS) return null
    return parsed.post
  } catch {
    return null
  }
}

export function subscribeFeedEvents(l: Listener) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
