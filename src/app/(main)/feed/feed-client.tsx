'use client'

import { useState, useTransition, useEffect, useRef, useCallback } from 'react'
import { getForYouFeedAction, getFollowingFeedAction, getMutualsFeedAction, type FeedPost } from '@/lib/actions'
import PostCard from '@/components/feed/post-card'
import AdSlot from '@/components/feed/ad-card'
import { Loader } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/client'
import FloatingComposeBtn from '@/components/feed/floating-compose-btn'

type Tab = 'for-you' | 'following' | 'mutuals'
const AD_EVERY = 5

interface FeedClientProps {
  initialPosts: FeedPost[]
  initialCursor: string | null
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

const EMPTY: Record<Tab, { title: string; body: string }> = {
  'for-you':   { title: 'Nothing here yet',     body: 'Be the first to post today.' },
  'following': { title: 'Follow some creators', body: 'Follow people to see their posts here.' },
  'mutuals':   { title: 'No mutuals yet',       body: 'When someone follows you back, their posts appear here.' },
}

export default function FeedClient({ initialPosts, initialCursor }: FeedClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('for-you')
  const [posts, setPosts] = useState<FeedPost[]>(initialPosts)
  const [cursor, setCursor] = useState<string | null>(initialCursor)
  const [hasMore, setHasMore] = useState(!!initialCursor)
  const [isPending, startTransition] = useTransition()
  const sentinelRef = useRef<HTMLDivElement>(null)
  const tabRef = useRef<Tab>('for-you')
  tabRef.current = activeTab

  function switchTab(tab: Tab) {
    if (tab === activeTab) return
    setActiveTab(tab)
    setPosts([])
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

  // Keep a ref to latest posts so the realtime handler can read current IDs
  // without the effect needing posts as a dependency (which would cause
  // constant resubscription and break optimistic updates).
  const postsRef = useRef<FeedPost[]>(initialPosts)
  postsRef.current = posts

  // Single realtime subscription per tab. Re-subscribes only when the tab
  // changes. Uses postsRef to filter updates to visible post IDs only.
  useEffect(() => {
    const supabase = createBrowserClient()
    const channel = supabase
      .channel(`feed:posts:${activeTab}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'posts',
      }, payload => {
        const u = payload.new as {
          id: string
          likes_count: number
          dislikes_count: number
          reposts_count: number
          comments_count: number
        }
        // Only patch posts currently visible in this tab
        const visibleIds = new Set(postsRef.current.map(p => p.id))
        if (!visibleIds.has(u.id)) return
        setPosts(prev => prev.map(p =>
          p.id === u.id
            ? {
                ...p,
                likes_count: u.likes_count,
                dislikes_count: u.dislikes_count,
                reposts_count: u.reposts_count,
                comments_count: u.comments_count,
              }
            : p
        ))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeTab])

  return (
    <div>
      {/* Tab bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)',
        background: 'var(--nav-bg)',
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

      {/* Skeleton loader */}
      {isPending && posts.length === 0 && Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{
          padding: '16px 20px', borderBottom: '1px solid var(--color-border)',
          display: 'flex', gap: 12,
        }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--color-surface-3)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 12, background: 'var(--color-surface-3)', borderRadius: 4, width: '40%', marginBottom: 10 }} />
            <div style={{ height: 14, background: 'var(--color-surface-3)', borderRadius: 4, width: '90%', marginBottom: 6 }} />
            <div style={{ height: 14, background: 'var(--color-surface-3)', borderRadius: 4, width: '70%' }} />
          </div>
        </div>
      ))}

      {posts.map((post, index) => (
        <div key={post.id}>
          <PostCard post={post} />
          {(index + 1) % AD_EVERY === 0 && (
            <AdSlot postId={post.id} position={Math.floor(index / AD_EVERY)} />
          )}
        </div>
      ))}

      {/* Empty state */}
      {!isPending && posts.length === 0 && (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🇳🇬</div>
          <h3 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20,
            color: 'var(--color-text-primary)', marginBottom: 8,
          }}>
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
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!hasMore && posts.length > 0 && (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-faint)' }}>You&apos;re all caught up 🎉</p>
        </div>
      )}
      {/* Floating compose button — shows near bottom of feed, hides at top */}
      <FloatingComposeBtn onPosted={post => setPosts(prev => [post as FeedPost, ...prev])} />
    </div>
  )
}