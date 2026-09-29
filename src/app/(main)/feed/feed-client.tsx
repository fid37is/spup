// src/app/(main)/feed/feed-client.tsx
'use client'

import { useState, useTransition, useEffect, useRef, useCallback, useMemo } from 'react'
import { getForYouFeedAction, getFollowingFeedAction, getMutualsFeedAction, getSellingFeedAction, markFeedSeenAction, dismissCatchUpAction, getPostsByIdsAction, getFeedAudienceAction, type FeedPost, type CatchUp } from '@/lib/actions'
import PostCardWithAnalytics from '@/components/feed/post-card-with-analytics'
import AdSlot from '@/components/feed/ad-card'
import CatchUpCard from '@/components/feed/catch-up-card'
import { Loader, Repeat2, Rss, Users, Sparkles, Tag, ArrowUp } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/client'
import FloatingComposeBtn from '@/components/feed/floating-compose-btn'
import { NotifAvatar } from '@/components/notifications/avatar'
import { useNetworkStatus } from '@/lib/network-status'
import { useOfflinePostSync } from '@/hooks/use-offline-post-sync'
import { WifiOff, Send } from 'lucide-react'
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

// Feed "seen" heartbeat (drives the While-you-were-away catch-up): count the
// user as having been on the feed once it's been visible for a few seconds -
// a bounce straight back out shouldn't swallow the posts they never saw -
// then keep refreshing it while they stay.
const SEEN_AFTER_MS = 15_000
const HEARTBEAT_MS  = 60_000

interface FeedClientProps {
  initialPosts: FeedPost[]
  initialCursor: string | null
  initialCatchUp?: CatchUp | null
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

export default function FeedClient({ initialPosts, initialCursor, initialCatchUp = null, currentUserId, currentUserAvatarUrl, currentUserDisplayName }: FeedClientProps) {
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
  const [catchUp, setCatchUp]           = useState<CatchUp | null>(initialCatchUp)
  const feedTopRef  = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const tabRef      = useRef<Tab>('for-you')
  tabRef.current = activeTab

  const { status: networkStatus, isOffline } = useNetworkStatus()
  const networkStatusRef = useRef(networkStatus)
  networkStatusRef.current = networkStatus

  const { pendingCount, trySync } = useOfflinePostSync()

  // Initial load if server sends empty
  useEffect(() => {
    if (initialPosts.length === 0) {
      startTransition(async () => {
        const { posts: fresh, nextCursor } = await getForYouFeedAction()
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

  function dismissCatchUp() {
    setCatchUp(null)
    dismissCatchUpAction().catch(() => { /* best effort */ })
  }

  // A post just written on the /compose page: show it at the top right away.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('spup:just-posted')
      if (!raw) return
      sessionStorage.removeItem('spup:just-posted')
      const post = JSON.parse(raw) as FeedPost
      if (post?.id) {
        setPosts(prev => (prev.some(p => p.id === post.id) ? prev : [post, ...prev]))
        window.scrollTo(0, 0)
      }
    } catch { /* ignore */ }
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

  // Catch-up only belongs on the For You tab. Posts it already highlights are
  // pulled out of the stream below so nothing appears twice, and a divider marks
  // where the stream crosses back to things from before the user's last visit.
  const showCatchUp = catchUp !== null && activeTab === 'for-you'
  const highlightIds = useMemo(
    () => new Set(showCatchUp ? catchUp!.highlights.map(p => p.id) : []),
    [showCatchUp, catchUp]
  )
  const visiblePosts = useMemo(
    () => (highlightIds.size ? posts.filter(p => !highlightIds.has(p.id)) : posts),
    [posts, highlightIds]
  )
  const dividerPostId = useMemo(() => {
    if (!showCatchUp) return null
    const since = catchUp!.since
    // Promoted posts are spliced in out of order, so they can't mark the boundary.
    const boundary = visiblePosts.find(p => !p.is_promoted && p.created_at <= since)
    // Nothing to divide if the whole list is newer than the last visit (the
    // boundary is further down, not loaded yet) or older (nothing new is shown).
    return boundary && boundary.id !== visiblePosts[0]?.id ? boundary.id : null
  }, [showCatchUp, catchUp, visiblePosts])

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
    try {
      let incoming: FeedPost[]
      if (overflowed || ids.length === 0) {
        // Too many to patch in (or nothing tracked): refresh the top of the feed
        incoming = (await getFeedFn(tab)()).posts
      } else {
        // Exactly the posts that arrived - not a whole ranked page - newest first
        incoming = (await getPostsByIdsAction([...ids].reverse()))
          .sort((x, y) => (x.created_at < y.created_at ? 1 : x.created_at > y.created_at ? -1 : 0))
      }
      if (tabRef.current !== tab) return // user switched tabs while loading
      setPosts(prev => {
        const existingIds = new Set(prev.map(p => p.id))
        const toAdd = incoming.filter(p => !existingIds.has(p.id))
        return toAdd.length ? [...toAdd, ...prev] : prev
      })
      setNewAuthors([])
      seenAuthorsRef.current = new Set()
      feedTopRef.current?.scrollIntoView({ behavior: 'smooth' })
    } catch {
      // Put them back (ahead of anything that arrived meanwhile) so the pill can retry
      pendingIdsRef.current = [...ids, ...pendingIdsRef.current].slice(0, MAX_PENDING_IDS)
      pendingOverflowRef.current = pendingOverflowRef.current || overflowed
      setHasNew(true)
    } finally {
      setIsFetchingNew(false)
    }
  }

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
      </div>

      {/* Degraded/offline banner - explains why refresh & pagination are paused */}
      {networkStatus !== 'online' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
          background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)',
          fontSize: 13, color: 'var(--color-text-muted)',
        }}>
          <WifiOff size={14} />
          {isOffline
            ? t('feed.offline_notice')
            : t('feed.slow_connection')}
        </div>
      )}

      {/* Queued offline posts - synced automatically on reconnect, but a
          manual retry is offered since iOS has no real background sync. */}
      {pendingCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '10px 16px', background: 'var(--color-brand-dim)', borderBottom: '1px solid var(--color-border)',
          fontSize: 13, color: 'var(--color-text-primary)',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Send size={14} />
            {t('feed.queued_offline', { count: pendingCount, plural: pendingCount > 1 ? 's' : '' })}
          </span>
          {networkStatus === 'online' && (
            <button
              type="button"
              onClick={() => trySync()}
              style={{ background: 'none', border: 'none', color: 'var(--color-brand)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              {t('feed.retry_now')}
            </button>
          )}
        </div>
      )}

      {/* New posts pill */}
      {(hasNew || isFetchingNew) && (
        <div style={{
          position: 'sticky', top: 57, zIndex: 9,
          display: 'flex', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <button
            onClick={showNewPosts}
            disabled={isFetchingNew}
            style={{
              pointerEvents: 'auto',
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--color-brand)', color: 'white',
              border: 'none', borderRadius: 24,
              padding: '8px 18px', marginTop: 10,
              fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
              cursor: isFetchingNew ? 'default' : 'pointer',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              animation: 'pillIn 0.2s cubic-bezier(0.34,1.56,0.64,1)',
            }}
          >
            {isFetchingNew
              ? <Loader size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
              : <ArrowUp size={16} />}
            {newAuthors.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center' }}>
                {newAuthors.map((a, i) => (
                  <span key={a.id} style={{
                    display: 'flex', borderRadius: '50%',
                    border: '2px solid var(--color-brand)',
                    marginLeft: i === 0 ? 0 : -8,
                    position: 'relative', zIndex: newAuthors.length - i,
                  }}>
                    <NotifAvatar name={a.display_name} url={a.avatar_url} size={24} />
                  </span>
                ))}
              </span>
            )}
            {isFetchingNew ? t('feed.new_posts_loading') : t('feed.new_posts_posted')}
          </button>
        </div>
      )}

      {/* While you were away - best posts from what a returning user missed */}
      {showCatchUp && (
        <CatchUpCard catchUp={catchUp!} currentUserId={currentUserId} onDismiss={dismissCatchUp} />
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
      {visiblePosts.map((post, index) => (
        <div key={post.id}>
          {post.id === dividerPostId && (
            <div style={{
              padding: '10px 16px', fontSize: 12, fontWeight: 600, letterSpacing: 0.3,
              textTransform: 'uppercase', color: 'var(--color-text-muted)',
              background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)',
            }}>
              {t('feed.from_before_last_visit')}
            </div>
          )}
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
        @keyframes pillIn { from { opacity:0; transform:translateY(-8px) scale(0.95) } to { opacity:1; transform:none } }
      `}</style>
    </div>
  )
}