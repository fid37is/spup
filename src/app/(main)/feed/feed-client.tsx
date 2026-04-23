// src/app/(main)/feed/feed-client.tsx
'use client'

import { useState, useTransition, useEffect, useRef, useCallback } from 'react'
import { getForYouFeedAction, getFollowingFeedAction, type FeedPost } from '@/lib/actions'
import PostCard from '@/components/feed/post-card'
import AdSlot from '@/components/feed/ad-card'
import PostComposer from './post-composer'
import { Loader } from 'lucide-react'

type Tab = 'for-you' | 'following'
const AD_EVERY = 5

interface FeedClientProps {
  initialPosts: FeedPost[]
  initialCursor: string | null
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
    setActiveTab(tab); setPosts([]); setCursor(null); setHasMore(true)
    startTransition(async () => {
      const fn = tab === 'for-you' ? getForYouFeedAction : getFollowingFeedAction
      const { posts: fresh, nextCursor } = await fn()
      setPosts(fresh); setCursor(nextCursor); setHasMore(!!nextCursor)
    })
  }

  const loadMore = useCallback(() => {
    if (isPending || !hasMore || !cursor) return
    startTransition(async () => {
      const fn = tabRef.current === 'for-you' ? getForYouFeedAction : getFollowingFeedAction
      const { posts: more, nextCursor } = await fn(cursor)
      setPosts(prev => {
        const seen = new Set(prev.map(p => p.id))
        return [...prev, ...more.filter(p => !seen.has(p.id))]
      })
      setCursor(nextCursor); setHasMore(!!nextCursor)
    })
  }, [isPending, hasMore, cursor])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(e => { if (e[0].isIntersecting) loadMore() }, { rootMargin: '400px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  return (
    <div>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(20px)', background: 'rgba(5,5,8,0.9)', borderBottom: '1px solid #1E1E26' }}>
        <div style={{ display: 'flex' }}>
          {(['for-you', 'following'] as Tab[]).map(tab => (
            <button key={tab} onClick={() => switchTab(tab)} style={{
              flex: 1, padding: '15px 0', background: 'none', border: 'none',
              color: activeTab === tab ? '#F0F0EC' : '#44444A',
              fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
              borderBottom: activeTab === tab ? '2px solid #1A9E5F' : '2px solid transparent',
              cursor: 'pointer', transition: 'color 0.15s', textTransform: 'capitalize',
            }}>
              {tab === 'for-you' ? 'For you' : 'Following'}
            </button>
          ))}
        </div>
      </div>

      <PostComposer onPosted={post => setPosts(prev => [post as FeedPost, ...prev])} />

      {isPending && posts.length === 0 && Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ padding: '16px 20px', borderBottom: '1px solid #141414', display: 'flex', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#1A1A20' }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 12, background: '#1A1A20', borderRadius: 4, width: '40%', marginBottom: 10 }} />
            <div style={{ height: 14, background: '#1A1A20', borderRadius: 4, width: '90%', marginBottom: 6 }} />
            <div style={{ height: 14, background: '#1A1A20', borderRadius: 4, width: '70%' }} />
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

      {!isPending && posts.length === 0 && (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🇳🇬</div>
          <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, color: '#F0F0EC', marginBottom: 8 }}>
            {activeTab === 'following' ? 'Follow some creators' : 'Nothing here yet'}
          </h3>
          <p style={{ fontSize: 15, color: '#44444A', lineHeight: 1.6 }}>
            {activeTab === 'following' ? 'Follow people to see their posts here.' : 'Be the first to post today.'}
          </p>
        </div>
      )}

      <div ref={sentinelRef} style={{ height: 1 }} />

      {isPending && posts.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <Loader size={20} color="#1A9E5F" style={{ animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {!hasMore && posts.length > 0 && (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: '#28282E' }}>You&apos;re all caught up 🎉</p>
        </div>
      )}
    </div>
  )
}