// src/app/(main)/feed/feed-client.tsx
'use client'

import { useState, useTransition, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { getForYouFeedAction, getFollowingFeedAction, getMutualsFeedAction, getSellingFeedAction, markFeedSeenAction, getPostsByIdsAction, getFeedAudienceAction, type FeedPost } from '@/lib/actions'
import PostCardWithAnalytics from '@/components/feed/post-card-with-analytics'
import AdSlot from '@/components/feed/ad-card'
import { FeedAnnouncementBanner, FeedAnnouncementStrip } from '@/components/feed/announcement-slots'
import { Loader, Repeat2, Rss, Users, Sparkles, Tag, ArrowUp } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/client'
import FloatingComposeBtn from '@/components/feed/floating-compose-btn'
import { NotifAvatar } from '@/components/notifications/avatar'
import { useNetworkStatus } from '@/lib/network-status'
import { subscribeFeedEvents, takeJustPosted } from '@/lib/feed-local-events'
import { useOfflinePostSync } from '@/hooks/use-offline-post-sync'
import { useTranslation } from '@/lib/i18n/language-context'

type Tab = 'for-you' | 'following' | 'mutuals' | 'selling'
const AD_EVERY = 5
// Avatars shown on the "posted" pill (like X). Once this many are resolved, further
// realtime events cost nothing at all.
const MAX_PILL_AVATARS = 3

type NewAuthor = { id: string; display_name: string; avatar_url: string | null }

// Who the viewer follows / is mutuals with / has hidden - lets a realtime INSERT be
// judged against the tab on screen with no query per event.
type Audience = { following: Set<string>; mutuals: Set<string>; hidden: Set<string> }

// New posts waiting behind the pill are tracked by id and fetched by id on click
// (one small indexed read of exactly those posts). Past this many the pill click
// refreshes the top of the feed instead, so a long-idle tab can't leave a gap.
const MAX_PENDING_IDS = 40

// Engagement counts on posts already on screen are refreshed with one batched read
// this often (while the tab is visible) - see the note on the polling effect.
const COUNT_POLL_MS = 25_000
const COUNT_POLL_MAX_IDS = 100

// Feed "seen" heartbeat: count the user as having been on the feed once it's
// been visible for a few seconds, then keep refreshing it while they stay.
const SEEN_AFTER_MS = 15_000
const HEARTBEAT_MS  = 60_000

// Pick-up-where-you-left-off. The For You feed is saved on this device (posts
// already loaded + the post that was at the top of the screen). Coming back,
// the feed reopens at that same post; whatever was posted since is NOT mixed
// in - it waits behind the pill and is added only when the user taps the pill,
// scrolls back up to it, or reloads. Nothing is re-downloaded to do this: the
// first page the server already sent is simply compared against the saved one.
const SNAPSHOT_VERSION = 1
const SNAPSHOT_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000
const SNAPSHOT_MAX_POSTS = 120
const snapshotKey = (userId: string) => `spup:feed-snapshot:v${SNAPSHOT_VERSION}:${userId}`

type FeedSnapshot = {
  posts: FeedPost[]
  cursor: string | null
  hasMore: boolean
  anchor: { id: string; offset: number } | null
  savedAt: number
}

function readSnapshot(userId: string): FeedSnapshot | null {
  try {
    const raw = localStorage.getItem(snapshotKey(userId))
    if (!raw) return null
    const snap = JSON.parse(raw) as FeedSnapshot
    if (!Array.isArray(snap.posts) || snap.posts.length === 0) return null
    if (Date.now() - snap.savedAt > SNAPSHOT_MAX_AGE_MS) return null
    return snap
  } catch { return null }
}

function wasPageReload(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return nav?.type === 'reload'
  } catch { return false }
}

interface FeedClientProps {
  initialPosts: FeedPost[]
  initialCursor: string | null
  currentUserId?: string
  currentUserAvatarUrl?: string | null
  currentUserDisplayName?: string | null
}

const TABS: { key: Tab; labelKey: string }[] = [
  { key: 'for-you',   labelKey: 'feed.for_you'   },
  { key: 'following', labelKey: 'feed.following' },
  { key: 'mutuals',   labelKey: 'feed.mutuals'   },
  { key: 'selling',   labelKey: 'feed.selling'   },
]

function getFeedFn(tab: Tab) {
  if (tab === 'following') return getFollowingFeedAction
  if (tab === 'mutuals')   return getMutualsFeedAction
  if (tab === 'selling')   return getSellingFeedAction
  return getForYouFeedAction
}

const EMPTY: Record<Tab, { icon: React.ReactNode; titleKey: string; bodyKey: string }> = {
  'for-you':   { icon: <Sparkles size={32} />, titleKey: 'feed.empty_for_you_title',   bodyKey: 'feed.empty_for_you_desc' },
  'following': { icon: <Users size={32} />,    titleKey: 'feed.empty_following_title', bodyKey: 'feed.empty_following_desc' },
  'mutuals':   { icon: <Rss size={32} />,      titleKey: 'feed.empty_mutuals',         bodyKey: 'feed.empty_mutuals_desc' },
  'selling':   { icon: <Tag size={32} />,      titleKey: 'feed.empty_selling',         bodyKey: 'feed.empty_selling_desc' },
}

export default function FeedClient({ initialPosts, initialCursor, currentUserId, currentUserAvatarUrl, currentUserDisplayName }: FeedClientProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab]       = useState<Tab>('for-you')
  const [posts, setPosts]               = useState<FeedPost[]>(initialPosts)
  const [cursor, setCursor]             = useState<string | null>(initialCursor)
  const [hasMore, setHasMore]           = useState(initialPosts.length > 0 ? !!initialCursor : true)
  const [isPending, startTransition]    = useTransition()
  const [hasNew, setHasNew]             = useState(false)
  const [isFetchingNew, setIsFetchingNew] = useState(false)
  const [newAuthors, setNewAuthors]     = useState<NewAuthor[]>([])
  const seenAuthorsRef = useRef<Set<string>>(new Set())
  const pendingIdsRef = useRef<string[]>([])            // arrival order, oldest first
  const pendingOverflowRef = useRef(false)              // more arrived than we track
  const audienceRef = useRef<Promise<Audience | null> | null>(null)
  const pendingPostsRef = useRef<Map<string, FeedPost>>(new Map()) // new posts already in hand (from the server's first page)
  const restoreAnchorRef = useRef<{ id: string; offset: number } | null>(null)
  const restoredRef = useRef<{ baseline: string; have: Set<string> } | null>(null)
  const [restoreTick, setRestoreTick] = useState(0)
  const [scrollTopTick, setScrollTopTick] = useState(0) // bumped after new posts are committed - see the layout effect below
  const [fadeInIds, setFadeInIds] = useState<Set<string>>(new Set()) // posts just revealed - fade in quietly
  const lastAnchorRef = useRef<{ id: string; offset: number } | null>(null) // last known reading position
  const feedTopRef  = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const tabRef      = useRef<Tab>('for-you')
  tabRef.current = activeTab

  const { status: networkStatus, isOffline } = useNetworkStatus()
  const networkStatusRef = useRef(networkStatus)
  networkStatusRef.current = networkStatus

  // Queued offline posts still sync on reconnect / reopen (the hook does that
  // itself) - there is just no banner about it anymore.
  useOfflinePostSync()

  // Posts that arrived since the saved feed was left. They are NOT mixed into
  // what's on screen: ids wait behind the pill (the posts themselves are kept
  // so tapping it needs no second download) and the pill shows who posted.
  function queueNewFromServer(list: FeedPost[]) {
    const r = restoredRef.current
    if (!r) return
    const fresh = list
      .filter(p => !p.is_promoted && !r.have.has(p.id) && p.created_at > r.baseline && p.author?.id !== currentUserId)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)) // oldest first
    if (!fresh.length) return
    const queue = pendingIdsRef.current
    for (const p of fresh) {
      if (queue.includes(p.id)) continue
      if (queue.length >= MAX_PENDING_IDS) pendingOverflowRef.current = true
      else { queue.push(p.id); pendingPostsRef.current.set(p.id, p) }
    }
    const authors: NewAuthor[] = []
    for (const p of [...fresh].reverse()) { // most recent posters first
      if (authors.length >= MAX_PILL_AVATARS) break
      if (!p.author || authors.some(a => a.id === p.author.id)) continue
      authors.push({ id: p.author.id, display_name: p.author.display_name, avatar_url: p.author.avatar_url })
      seenAuthorsRef.current.add(p.author.id)
    }
    setNewAuthors(authors)
    setHasNew(true)
  }

  // Reopen the For You feed where the user stopped reading (see the
  // SNAPSHOT_* note above). Runs before paint so there is no flash of the
  // top of the feed. A browser reload deliberately skips this: reloading
  // means "give me the newest", so it starts fresh from the top.
  useLayoutEffect(() => {
    if (!currentUserId) return
    if (wasPageReload()) {
      try { localStorage.removeItem(snapshotKey(currentUserId)) } catch { /* ignore */ }
      return
    }
    const snap = readSnapshot(currentUserId)
    if (!snap) return
    restoredRef.current = {
      baseline: snap.posts.reduce((m, p) => (!p.is_promoted && p.created_at > m ? p.created_at : m), ''),
      have: new Set(snap.posts.map(p => p.id)),
    }
    setPosts(snap.posts)
    setCursor(snap.cursor)
    setHasMore(snap.hasMore)
    queueNewFromServer(initialPosts)
    restoreAnchorRef.current = snap.anchor
    lastAnchorRef.current = snap.anchor
    setRestoreTick(1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Once the saved posts are rendered, put the saved post back where it was.
  useLayoutEffect(() => {
    if (restoreTick === 0) return
    const a = restoreAnchorRef.current
    if (!a) return
    const place = () => {
      const el = document.querySelector<HTMLElement>(`[data-feed-post="${CSS.escape(a.id)}"]`)
      if (el) window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - a.offset))
      return !!el
    }
    place()
    // Once more next frame - the router can scroll to the top after mounting.
    requestAnimationFrame(() => { place(); restoreAnchorRef.current = null })
  }, [restoreTick])

  // Initial load if server sends empty
  useEffect(() => {
    if (initialPosts.length === 0) {
      startTransition(async () => {
        const { posts: fresh, nextCursor } = await getForYouFeedAction()
        if (restoredRef.current) { queueNewFromServer(fresh); return }
        // Keep anything already on screen (e.g. a post just written on /compose)
        setPosts(prev => [...prev.filter(p => !fresh.some(f => f.id === p.id)), ...fresh])
        setCursor(nextCursor)
        setHasMore(!!nextCursor)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Heartbeat: tell the server the user is actively on the feed, so the next
  // time they come back after a long absence we know where to catch them up from.
  useEffect(() => {
    let visibleMs = 0
    let lastMarkedAt = -Infinity
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      visibleMs += 5000
      if (visibleMs < SEEN_AFTER_MS || visibleMs - lastMarkedAt < HEARTBEAT_MS) return
      if (networkStatusRef.current !== 'online') return
      lastMarkedAt = visibleMs
      markFeedSeenAction().catch(() => { /* best effort */ })
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  // A post that finished sending in the background while no feed was on
  // screen (see lib/posting/poster): show it at the top as soon as the feed opens.
  useEffect(() => {
    const post = takeJustPosted()
    if (post?.id) {
      setPosts(prev => (prev.some(p => p.id === post.id) ? prev : [post, ...prev]))
      window.scrollTo(0, 0)
    }
  }, [])

  // A post sent in the background finishing while the feed is open: add it at
  // the top. Scroll up only if the person is already near the top - they may
  // have scrolled away while it sent, and yanking them back would be rude
  // (the "Post sent" toast has a View button for that case).
  useEffect(() => {
    return subscribeFeedEvents(e => {
      if (e.type !== 'post-created') return
      const post = e.post
      // The Selling tab only lists selling posts.
      if (tabRef.current === 'selling' && !(post as { is_selling?: boolean }).is_selling) return
      setPosts(prev => (prev.some(p => p.id === post.id) ? prev : [post, ...prev]))
      if (window.scrollY < 400) feedTopRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
  }, [])

  function switchTab(tab: Tab) {
    if (tab === activeTab) return
    if (networkStatusRef.current === 'offline') return
    setActiveTab(tab)
    setPosts([])
    setHasNew(false)
    setNewAuthors([])
    seenAuthorsRef.current = new Set()
    pendingIdsRef.current = []
    pendingOverflowRef.current = false
    audienceRef.current = null // re-read follows/blocks lazily, they may have changed
    setCursor(null)
    setHasMore(true)
    startTransition(async () => {
      const { posts: fresh, nextCursor } = await getFeedFn(tab)()
      setPosts(fresh)
      setCursor(nextCursor)
      setHasMore(!!nextCursor)
    })
  }

  const loadMore = useCallback(() => {
    if (isPending || !hasMore || !cursor) return
    if (networkStatusRef.current !== 'online') return
    startTransition(async () => {
      const { posts: more, nextCursor } = await getFeedFn(tabRef.current)(cursor)
      setPosts(prev => {
        const seen = new Set(prev.map(p => p.id))
        return [...prev, ...more.filter(p => !seen.has(p.id))]
      })
      setCursor(nextCursor)
      setHasMore(!!nextCursor)
    })
  }, [isPending, hasMore, cursor])

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      e => { if (e[0].isIntersecting) loadMore() },
      { rootMargin: '400px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  const postsRef = useRef<FeedPost[]>(initialPosts)
  postsRef.current = posts

  // Live engagement for the posts on screen: other people's likes/reposts/comments,
  // and this person's own like/repost state (so a like made on another device or in
  // another view shows up too).
  //
  // Deliberately NOT a realtime subscription to posts UPDATEs: every like,
  // impression and video view is an UPDATE on posts, and Realtime would push each
  // one to every connected user and re-check RLS per subscriber - cost grows with
  // (users x site-wide writes). Three small batched reads every COUNT_POLL_MS grow
  // with users only, and are skipped while the tab is hidden or offline.
  //
  // Read straight from the browser (RLS-protected, same as the feed's own
  // queries) rather than through a server action: server actions run one at a
  // time per client, so a poll could otherwise make a like tap wait behind it.
  // The person's own taps are unaffected either way - they're applied instantly
  // by lib/engagement-state and only reconciled against these snapshots.
  useEffect(() => {
    const supabase = createBrowserClient()
    let inFlight = false
    let lastRun = 0
    async function refreshCounts() {
      if (inFlight || document.visibilityState !== 'visible' || networkStatusRef.current !== 'online') return
      if (Date.now() - lastRun < 5000) return
      const ids = postsRef.current.slice(0, COUNT_POLL_MAX_IDS).map(p => p.id)
      if (!ids.length) return
      inFlight = true
      lastRun = Date.now()
      try {
        const [countsRes, likesRes, repostsRes] = await Promise.all([
          supabase.from('posts')
            .select('id, likes_count, reposts_count, comments_count, impressions_count')
            .in('id', ids).is('deleted_at', null),
          currentUserId
            ? supabase.from('likes').select('post_id').eq('user_id', currentUserId).in('post_id', ids)
            : Promise.resolve(null),
          currentUserId
            ? supabase.from('posts').select('quoted_post_id')
                .eq('user_id', currentUserId).eq('post_type', 'repost').in('quoted_post_id', ids)
            : Promise.resolve(null),
        ])
        if (countsRes.error || !countsRes.data?.length) return
        const byId = new Map<string, {
          id: string; likes_count: number; reposts_count: number; comments_count: number; impressions_count: number
        }>(countsRes.data.map((r: {
          id: string; likes_count: number; reposts_count: number; comments_count: number; impressions_count: number
        }) => [r.id, r]))
        // Only trust the person's own state if its query succeeded - a failed one
        // must not read as "you've unliked everything".
        const likedSet = likesRes && !likesRes.error && likesRes.data
          ? new Set<string>(likesRes.data.map((l: { post_id: string }) => l.post_id)) : null
        const repostedSet = repostsRes && !repostsRes.error && repostsRes.data
          ? new Set<string>(repostsRes.data.map((r: { quoted_post_id: string }) => r.quoted_post_id)) : null

        setPosts(prev => {
          let changed = false
          const next = prev.map(p => {
            const r = byId.get(p.id)
            if (!r) return p
            const is_liked = likedSet ? likedSet.has(p.id) : p.is_liked
            const is_reposted = repostedSet ? repostedSet.has(p.id) : p.is_reposted
            if (
              r.likes_count === p.likes_count && r.reposts_count === p.reposts_count &&
              r.comments_count === p.comments_count && r.impressions_count === p.impressions_count &&
              is_liked === p.is_liked && is_reposted === p.is_reposted
            ) return p
            changed = true
            return {
              ...p,
              likes_count: r.likes_count, reposts_count: r.reposts_count,
              comments_count: r.comments_count, impressions_count: r.impressions_count,
              is_liked, is_reposted,
            }
          })
          return changed ? next : prev // untouched list => no re-render at all
        })
      } catch { /* best effort */ } finally { inFlight = false }
    }
    const timer = setInterval(refreshCounts, COUNT_POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshCounts() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [currentUserId])

  // Realtime - new posts only. One channel for the life of the feed (the tab is
  // read from tabRef at event time, so switching tabs doesn't tear down and
  // re-subscribe). No fetch happens here: an event is judged locally and, if it
  // belongs in the tab on screen, its id is queued behind the pill.
  useEffect(() => {
    const supabase = createBrowserClient()

    function getAudience(): Promise<Audience | null> {
      if (!audienceRef.current) {
        audienceRef.current = getFeedAudienceAction()
          .then(a => ({
            following: new Set<string>(a.following),
            mutuals: new Set<string>(a.mutuals),
            hidden: new Set<string>(a.hidden),
          }))
          .catch(() => { audienceRef.current = null; return null })
      }
      return audienceRef.current
    }

    // Resolve at most MAX_PILL_AVATARS distinct authors per pill cycle with a
    // single-row lookup each (avatar + name only) - never a feed query.
    function trackAuthor(authorId: string) {
      const seen = seenAuthorsRef.current
      if (seen.size >= MAX_PILL_AVATARS || seen.has(authorId)) return
      seen.add(authorId)
      const tabAtCall = tabRef.current
      supabase
        .from('users')
        .select('id, display_name, avatar_url')
        .eq('id', authorId)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) { seen.delete(authorId); return }
          if (tabRef.current !== tabAtCall) return // tab changed while resolving
          setNewAuthors(prev => (prev.some(a => a.id === data.id) ? prev : [...prev, data as NewAuthor]))
        })
    }

    function queuePending(id: string, authorId: string) {
      if (postsRef.current.some(p => p.id === id)) return
      const queue = pendingIdsRef.current
      if (queue.includes(id)) return
      if (queue.length >= MAX_PENDING_IDS) pendingOverflowRef.current = true
      else queue.push(id)
      setHasNew(true)
      trackAuthor(authorId)
    }

    const channel = supabase
      .channel('feed:new-posts')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'posts',
      }, payload => {
        const row = payload.new as {
          id?: string; user_id?: string; parent_post_id?: string | null
          is_selling?: boolean; created_at?: string
        }
        const id = row.id
        const authorId = row.user_id
        if (!id || !authorId) return
        // Replies never appear in these feeds. (Reposts do - the feed queries
        // include them - so they must be able to raise the pill too.)
        if (row.parent_post_id) return
        // Your own posts are already added locally via onPosted
        if (currentUserId && authorId === currentUserId) return
        // Scheduled posts are inserted early with a future created_at; the feed
        // queries hide them until due, so they must not raise the pill either.
        if (row.created_at && Date.parse(row.created_at) > Date.now() + 5000) return

        const tab = tabRef.current
        // Selling tab only cares about posts marked as selling
        if (tab === 'selling' && !row.is_selling) return

        // Mirror the feed queries: Following/Mutuals only include those people;
        // For You and Selling leave out anyone blocked or muted.
        void getAudience().then(aud => {
          if (tabRef.current !== tab) return
          if (tab === 'following' && !aud?.following.has(authorId)) return
          if (tab === 'mutuals'   && !aud?.mutuals.has(authorId))   return
          if ((tab === 'for-you' || tab === 'selling') && aud?.hidden.has(authorId)) return
          queuePending(id, authorId)
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [currentUserId])

  // Your own repost: the realtime channel skips your own inserts, so PostActions
  // hands the new repost over here. It waits behind the pill like anyone else's new
  // post (already in hand, so showing it costs no fetch). Undoing a repost removes
  // that repost from the list straight away.
  useEffect(() => {
    return subscribeFeedEvents(e => {
      if (e.type === 'post-created') return // handled by the listener above
      if (e.type === 'repost-added') {
        if (tabRef.current !== 'for-you') return
        const id = e.post.id
        if (postsRef.current.some(p => p.id === id) || pendingIdsRef.current.includes(id)) return
        if (pendingIdsRef.current.length >= MAX_PENDING_IDS) { pendingOverflowRef.current = true }
        else { pendingIdsRef.current.push(id); pendingPostsRef.current.set(id, e.post) }
        setHasNew(true)
        return
      }
      const isMineOf = (p: FeedPost) =>
        p.post_type === 'repost' && p.quoted_post_id === e.originalId && (!currentUserId || p.author?.id === currentUserId)
      const mine = new Set(postsRef.current.filter(isMineOf).map(p => p.id))
      for (const [id, p] of pendingPostsRef.current) if (isMineOf(p)) mine.add(id)
      if (mine.size === 0) return
      pendingIdsRef.current = pendingIdsRef.current.filter(id => !mine.has(id))
      mine.forEach(id => pendingPostsRef.current.delete(id))
      if (pendingIdsRef.current.length === 0 && !pendingOverflowRef.current) setHasNew(false)
      setPosts(prev => prev.filter(p => !mine.has(p.id)))
    })
  }, [currentUserId])

  async function showNewPosts() {
    if (isFetchingNew || networkStatusRef.current !== 'online') return
    const tab = tabRef.current
    const ids = pendingIdsRef.current
    const overflowed = pendingOverflowRef.current
    setIsFetchingNew(true)
    // Take the queue first so an event arriving mid-fetch re-arms the pill instead of being lost
    pendingIdsRef.current = []
    pendingOverflowRef.current = false
    setHasNew(false)
    // Take the person to the top straight away - they tapped to see the newest
    // posts, so don't leave them where they were while the posts load.
    window.scrollTo(0, 0)
    try {
      let incoming: FeedPost[]
      if (overflowed || ids.length === 0) {
        // Too many to patch in (or nothing tracked): refresh the top of the feed.
        // That page comes back in ranked order (and may carry an ad), so put it
        // newest-first and leave the ad out - the pill is for NEW posts.
        incoming = (await getFeedFn(tab)()).posts
          .filter(p => !p.is_promoted)
          .sort((x, y) => (x.created_at < y.created_at ? 1 : x.created_at > y.created_at ? -1 : 0))
      } else {
        // Exactly the posts that arrived - not a whole ranked page - newest first.
        // Ones already in hand (from the server's first page) aren't downloaded again.
        const inHand = ids.map(id => pendingPostsRef.current.get(id)).filter((p): p is FeedPost => !!p)
        const missing = ids.filter(id => !pendingPostsRef.current.has(id))
        const fetched = missing.length ? await getPostsByIdsAction([...missing].reverse()) : []
        incoming = [...inHand, ...fetched]
          .sort((x, y) => (x.created_at < y.created_at ? 1 : x.created_at > y.created_at ? -1 : 0))
      }
      if (tabRef.current !== tab) return // user switched tabs while loading
      const onScreen = new Set(postsRef.current.map(p => p.id))
      const toAdd = incoming.filter(p => !onScreen.has(p.id))
      setPosts(prev => {
        const existingIds = new Set(prev.map(p => p.id))
        const add = toAdd.filter(p => !existingIds.has(p.id))
        return add.length ? [...add, ...prev] : prev
      })
      // No sliding in: jump to the top and let the new posts fade in quietly.
      setFadeInIds(new Set(toAdd.map(p => p.id)))
      setTimeout(() => setFadeInIds(new Set()), 900)
      setNewAuthors([])
      seenAuthorsRef.current = new Set()
      pendingPostsRef.current = new Map()
      // Scroll again once the new posts are actually in the page (see the
      // layout effect below) - scrolling before they render can leave the
      // browser holding the old position.
      setScrollTopTick(n => n + 1)
    } catch {
      // Put them back (ahead of anything that arrived meanwhile) so the pill can retry
      pendingIdsRef.current = [...ids, ...pendingIdsRef.current].slice(0, MAX_PENDING_IDS)
      pendingOverflowRef.current = pendingOverflowRef.current || overflowed
      setHasNew(true)
    } finally {
      setIsFetchingNew(false)
    }
  }

  const showNewPostsRef = useRef(showNewPosts)
  showNewPostsRef.current = showNewPosts

  // After the pill's posts are committed to the page, make sure the person is
  // looking at the very top of them (before paint, so there is no visible jump).
  useLayoutEffect(() => {
    if (scrollTopTick === 0) return
    window.scrollTo(0, 0)
  }, [scrollTopTick])

  // Scrolling back up to the top while new posts are waiting loads them (same
  // as tapping the pill). Only fires on ARRIVING at the top from further down,
  // so posts never slide in under a reader who is already sitting at the top.
  useEffect(() => {
    const el = feedTopRef.current
    if (!el) return
    let awayFromTop = false
    const obs = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) { awayFromTop = true; return }
      if (!awayFromTop) return
      awayFromTop = false
      if (pendingIdsRef.current.length > 0 || pendingOverflowRef.current) void showNewPostsRef.current()
    }, { rootMargin: '120px 0px 0px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Remember the For You feed on this device so it can be reopened where the
  // user stopped (restored in the layout effect near the top).
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const hasMoreRef = useRef(hasMore)
  hasMoreRef.current = hasMore
  useEffect(() => {
    if (!currentUserId) return
    const userId = currentUserId
    let anchor = lastAnchorRef.current
    let timer: ReturnType<typeof setTimeout> | null = null

    function measureAnchor() {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-feed-post]'))) {
        const r = el.getBoundingClientRect()
        if (r.bottom > 60) { anchor = { id: el.dataset.feedPost!, offset: r.top }; return }
      }
    }
    function save() {
      if (tabRef.current !== 'for-you') return
      if (restoreAnchorRef.current) return // still putting the saved position back
      const list = postsRef.current
      if (!list.length) return
      let keep = list
      let cursorOut = cursorRef.current
      let hasMoreOut = hasMoreRef.current
      if (list.length > SNAPSHOT_MAX_POSTS) {
        // Cursor is the created_at of the last post, so a shorter list just
        // needs the cursor moved back to its own last (non-promoted) post.
        keep = list.slice(0, SNAPSHOT_MAX_POSTS)
        cursorOut = /^\d+$/.test(cursorRef.current ?? '')
          ? String(keep.filter(p => !p.is_promoted).length) // ranked pool: the cursor is an offset
          : [...keep].reverse().find(p => !p.is_promoted)?.created_at ?? null
        hasMoreOut = true
      }
      const a = anchor && keep.some(p => p.id === anchor!.id) ? anchor : null
      try {
        const snap: FeedSnapshot = { posts: keep, cursor: cursorOut, hasMore: hasMoreOut, anchor: a, savedAt: Date.now() }
        localStorage.setItem(snapshotKey(userId), JSON.stringify(snap))
      } catch {
        try { localStorage.removeItem(snapshotKey(userId)) } catch { /* ignore */ }
      }
    }
    function onScroll() {
      if (restoreAnchorRef.current) return
      measureAnchor()
      if (timer) clearTimeout(timer)
      timer = setTimeout(save, 600)
    }
    function onHide() {
      if (document.visibilityState === 'hidden') { if (!restoreAnchorRef.current) measureAnchor(); save() }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
      if (timer) clearTimeout(timer)
      save() // leaving the feed (e.g. opening a post) - uses the last measured position
    }
  }, [currentUserId])

  return (
    <div>
      <div ref={feedTopRef} />

      {/* Tab bar */}
      <div className="feed-tab-bar" style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex' }}>
          {TABS.map(({ key, labelKey }) => (
            <button
              key={key}
              onClick={() => switchTab(key)}
              style={{
                flex: 1, padding: '15px 0',
                background: 'none', border: 'none',
                color: activeTab === key ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
                borderBottom: activeTab === key ? '2px solid var(--color-brand)' : '2px solid transparent',
                cursor: 'pointer', transition: 'color 0.15s',
              }}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        {/* Urgent maintenance notice: pinned with the tabs so it stays in view while scrolling */}
        <FeedAnnouncementStrip />
      </div>

      {/* New-feature announcement: in the page flow under the tabs, scrolls away with the posts */}
      <FeedAnnouncementBanner />

      {/* New posts pill */}
      {hasNew && (
        // Fixed to the very top of the screen like a toast (same centring as
        // layout/toast.tsx), floating over the header - takes no space in the
        // page, so nothing is pushed down.
        <div style={{
          position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: '50%',
          transform: 'translateX(-50%)', zIndex: 200, pointerEvents: 'none',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={showNewPosts}
            style={{
              pointerEvents: 'auto',
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--color-brand)', color: 'white',
              border: 'none', borderRadius: 20,
              padding: '4px 12px',
              fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              animation: 'pillIn 0.2s cubic-bezier(0.34,1.56,0.64,1)',
            }}
          >
            <ArrowUp size={14} />
            {newAuthors.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center' }}>
                {newAuthors.map((a, i) => (
                  <span key={a.id} style={{
                    display: 'flex', borderRadius: '50%',
                    border: '2px solid var(--color-brand)',
                    marginLeft: i === 0 ? 0 : -7,
                    position: 'relative', zIndex: newAuthors.length - i,
                  }}>
                    <NotifAvatar name={a.display_name} url={a.avatar_url} size={20} />
                  </span>
                ))}
              </span>
            )}
            {t('feed.new_posts_posted')}
          </button>
          </div>
        </div>
      )}

      {/* Skeleton */}
      {isPending && posts.length === 0 && Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--color-surface-3)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 12, background: 'var(--color-surface-3)', borderRadius: 4, width: '40%', marginBottom: 10 }} />
            <div style={{ height: 14, background: 'var(--color-surface-3)', borderRadius: 4, width: '90%', marginBottom: 6 }} />
            <div style={{ height: 14, background: 'var(--color-surface-3)', borderRadius: 4, width: '70%' }} />
          </div>
        </div>
      ))}

      {/* Posts */}
      {posts.map((post, index) => (
        <div key={post.id} data-feed-post={post.id} style={fadeInIds.has(post.id) ? { animation: 'feedFadeIn 0.6s ease-out' } : undefined}>
          <PostCardWithAnalytics post={post} currentUserId={currentUserId} />
          {(index + 1) % AD_EVERY === 0 && (
            <AdSlot postId={post.id} position={Math.floor(index / AD_EVERY)} />
          )}
        </div>
      ))}

      {/* Empty state */}
      {!isPending && posts.length === 0 && (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ color: 'var(--color-text-muted)', marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
            {EMPTY[activeTab].icon}
          </div>
          <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, color: 'var(--color-text-primary)', marginBottom: 8 }}>
            {t(EMPTY[activeTab].titleKey)}
          </h3>
          <p style={{ fontSize: 15, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            {t(EMPTY[activeTab].bodyKey)}
          </p>
        </div>
      )}

      <div ref={sentinelRef} style={{ height: 1 }} />

      {isPending && posts.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <Loader size={20} color="var(--color-brand)" style={{ animation: 'spin 0.8s linear infinite' }} />
        </div>
      )}

      {!isPending && hasMore && posts.length > 0 && networkStatus !== 'online' && (
        <div style={{ padding: '24px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>
            {isOffline ? t('feed.reconnect_to_load_more') : t('feed.loading_paused')}
          </p>
        </div>
      )}

      {!hasMore && posts.length > 0 && (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-faint)' }}>{t('feed.caught_up')}</p>
        </div>
      )}

      <FloatingComposeBtn
        authorAvatarUrl={currentUserAvatarUrl}
        authorName={currentUserDisplayName || t('feed.you')}
        userId={currentUserId}
        onPosted={post => {
          if (!post) return
          setPosts(prev => [post as FeedPost, ...prev])
          feedTopRef.current?.scrollIntoView({ behavior: 'smooth' })
        }}
      />

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg) } }
        @keyframes feedFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pillIn { from { opacity:0; transform:translateY(-8px) scale(0.95) } to { opacity:1; transform:none } }
      `}</style>
    </div>
  )
}