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

import type { FeedPost } from '@/lib/actions/feed'

export type FeedLocalEvent =
  | { type: 'repost-added'; post: FeedPost }
  | { type: 'repost-removed'; originalId: string }

type Listener = (e: FeedLocalEvent) => void
const listeners = new Set<Listener>()

export function publishFeedEvent(e: FeedLocalEvent) {
  listeners.forEach(l => l(e))
}

export function subscribeFeedEvents(l: Listener) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
