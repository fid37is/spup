// src/app/(main)/feed/feed-client.tsx
'use client'

import { useState, useTransition, useEffect, useRef, useCallback } from 'react'
import { getForYouFeedAction, getFollowingFeedAction, getMutualsFeedAction, type FeedPost } from '@/lib/actions'
import PostCardWithAnalytics from '@/components/feed/post-card-with-analytics'
import AdSlot from '@/components/feed/ad-card'
import { Loader, Repeat2, Rss, Users, Sparkles } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/client'
import FloatingComposeBtn from '@/components/feed/floating-compose-btn'

type Tab = 'for-you' | 'following' | 'mutuals'
const AD_EVERY = 5

interface FeedClientProps {
  initialPosts: FeedPost[]
  initialCursor: string | null
  currentUserId?: string
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'for-you',   label: 'For You'   },
  { key: 'following', label: 'Following' },
  { key: 'mutuals',   label: 'Mutuals'   },
]

function getFeedFn(tab: Tab) {
  if (tab === 'following') return getFollowingFeedAction
  if (tab === 'mutuals')   return getMutualsFeedAction
  return getForYouFeedAction
}

const EMPTY: Record<Tab, { icon: React.ReactNode; title: string; body: string }> = {
  'for-you':   { icon: <Sparkles size={32} />, title: 'Nothing here yet',     body: 'Be the first to post today.' },
  'following': { icon: <Users size={32} />,    title: 'Follow some creators', body: 'Follow people to see their posts here.' },
  'mutuals':   { icon: <Rss size={32} />,      title: 'No mutuals yet',       body: 'When someone follows you back, their posts appear here.' },
}

export default function FeedClient({ initialPosts, initialCursor, currentUserId }: FeedClientProps) {
  const [activeTab, setActiveTab]       = useState<Tab>('for-you')
  const [posts, setPosts]               = useState<FeedPost[]>(initialPosts)
  const [cursor, setCursor]             = useState<string | null>(initialCursor)
  const [hasMore, setHasMore]           = useState(initialPosts.length > 0 ? !!initialCursor : true)
  const [isPending, startTransition]    = useTransition()
  const [newPosts, setNewPosts]         = useState<FeedPost[]>([])
  const feedTopRef  = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const tabRef      = useRef<Tab>('for-you')
  tabRef.current = activeTab

  // Initial load if server sends empty
  useEffect(() => {
    if (initialPosts.length === 0) {
      startTransition(async () => {
        const { posts: fresh, nextCursor } = await getForYouFeedAction()
        setPosts(fresh)
        setCursor(nextCursor)
        setHasMore(!!nextCursor)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function switchTab(tab: Tab) {
    if (tab === activeTab) return
    setActiveTab(tab)
    setPosts([])
    setNewPosts([])
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

  // Realtime — update counts on existing posts + detect new posts
  useEffect(() => {
    const supabase = createBrowserClient()
    const channel = supabase
      .channel(`feed:posts:${activeTab}`)
      // Update counts on existing posts
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'posts',
      }, payload => {
        const u = payload.new as {
          id: string; likes_count: number; dislikes_count: number
          reposts_count: number; comments_count: number; impressions_count: number
        }
        const visibleIds = new Set(postsRef.current.map(p => p.id))
        if (!visibleIds.has(u.id)) return
        setPosts(prev => prev.map(p =>
          p.id === u.id
            ? { ...p, likes_count: u.likes_count, dislikes_count: u.dislikes_count, reposts_count: u.reposts_count, comments_count: u.comments_count, impressions_count: u.impressions_count }
            : p
        ))
      })
      // Detect new posts inserted — show pill
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'posts',
      }, async () => {
        // Only show pill for for-you and following tabs
        if (tabRef.current === 'mutuals') return
        // Fetch the latest posts and find truly new ones
        const { posts: latest } = await getFeedFn(tabRef.current)()
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id))
          const fresh = latest.filter(p => !existingIds.has(p.id))
          if (!fresh.length) return prev
          setNewPosts(n => {
            const allIds = new Set([...n.map(p => p.id), ...prev.map(p => p.id)])
            return [...n, ...fresh.filter(p => !allIds.has(p.id))]
          })
          return prev // don't prepend yet — wait for pill click
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeTab])

  function showNewPosts() {
    setPosts(prev => {
      const existingIds = new Set(prev.map(p => p.id))
      const toAdd = newPosts.filter(p => !existingIds.has(p.id))
      return [...toAdd, ...prev]
    })
    setNewPosts([])
    feedTopRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div>
      <div ref={feedTopRef} />

      {/* Tab bar */}
      <style>{`
        @media (max-width: 767px) { .feed-tab-bar { top: 56px !important; } }
      `}</style>
      <div className="feed-tab-bar" style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex' }}>
          {TABS.map(({ key, label }) => (
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
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* New posts pill */}
      {newPosts.length > 0 && (
        <div style={{
          position: 'sticky', top: 57, zIndex: 9,
          display: 'flex', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <button
            onClick={showNewPosts}
            style={{
              pointerEvents: 'auto',
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--color-brand)', color: 'white',
              border: 'none', borderRadius: 24,
              padding: '8px 18px', marginTop: 10,
              fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
              cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              animation: 'pillIn 0.2s cubic-bezier(0.34,1.56,0.64,1)',
            }}
          >
            <Rss size={14} />
            {newPosts.length} new post{newPosts.length > 1 ? 's' : ''}
          </button>
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
        <div key={post.id}>
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
            {EMPTY[activeTab].title}
          </h3>
          <p style={{ fontSize: 15, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            {EMPTY[activeTab].body}
          </p>
        </div>
      )}

      <div ref={sentinelRef} style={{ height: 1 }} />

      {isPending && posts.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <Loader size={20} color="var(--color-brand)" style={{ animation: 'spin 0.8s linear infinite' }} />
        </div>
      )}

      {!hasMore && posts.length > 0 && (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-faint)' }}>You&apos;re all caught up</p>
        </div>
      )}

      <FloatingComposeBtn onPosted={post => {
        setPosts(prev => [post as FeedPost, ...prev])
        feedTopRef.current?.scrollIntoView({ behavior: 'smooth' })
      }} />

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg) } }
        @keyframes pillIn { from { opacity:0; transform:translateY(-8px) scale(0.95) } to { opacity:1; transform:none } }
      `}</style>
    </div>
  )
}