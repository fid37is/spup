'use client'

/**
 * ProfileTabs
 * ────────────
 * Tabs: Posts | Replies | Media | Likes
 * Mutuals lives in the stats row on the profile header (not a tab).
 */

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader, PenLine, MessageCircle, Image, Heart, Play, Lock } from 'lucide-react'
import PostCardWithAnalytics from '@/components/feed/post-card-with-analytics'
import { getProfileTabAction } from '@/lib/actions/feed'
import type { FeedPost } from '@/lib/actions/feed'

type Tab = 'posts' | 'replies' | 'media' | 'likes'

interface TabState {
  posts: FeedPost[]
  cursor: string | null
  loaded: boolean
}

interface ProfileTabsProps {
  profileId: string
  initialPosts: FeedPost[]
  isOwner: boolean
  canSeeContent: boolean
  currentUserId?: string
}

const ALL_TABS: { key: Tab; label: string }[] = [
  { key: 'posts',   label: 'Posts'   },
  { key: 'replies', label: 'Replies' },
  { key: 'media',   label: 'Media'   },
  { key: 'likes',   label: 'Likes'   },
]

// ── Media grid item ───────────────────────────────────────────────────────────
function MediaGridItem({ post }: { post: FeedPost }) {
  const router = useRouter()
  const media  = post.media?.[0]
  if (!media) return null
  return (
    <div
      onClick={() => router.push(`/post/${post.id}`)}
      style={{
        aspectRatio: '1 / 1',
        background: 'var(--color-surface-3)',
        overflow: 'hidden',
        cursor: 'pointer',
        position: 'relative',
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0.8' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1' }}
    >
      {media.media_type === 'video' ? (
        <>
          <img
            src={media.thumbnail_url || media.url}
            alt="Video thumbnail"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.3)',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'rgba(0,0,0,0.65)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Play size={14} color="white" fill="white" style={{ marginLeft: 2 }} />
            </div>
          </div>
        </>
      ) : (
        <img
          src={media.url}
          alt={post.body || 'Media'}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
    </div>
  )
}

// ── Empty state — lucide icons only ──────────────────────────────────────────
function Empty({ tab }: { tab: Tab }) {
  const config: Record<Tab, { icon: React.ReactNode; text: string }> = {
    posts:   { icon: <PenLine size={28} color="var(--color-text-muted)" strokeWidth={1.5} />,    text: 'No posts yet'       },
    replies: { icon: <MessageCircle size={28} color="var(--color-text-muted)" strokeWidth={1.5} />, text: 'No replies yet'     },
    media:   { icon: <Image size={28} color="var(--color-text-muted)" strokeWidth={1.5} />,       text: 'No media posts yet' },
    likes:   { icon: <Heart size={28} color="var(--color-text-muted)" strokeWidth={1.5} />,       text: 'No liked posts yet' },
  }
  const { icon, text } = config[tab]
  return (
    <div style={{ padding: '64px 20px', textAlign: 'center' }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 14px',
      }}>
        {icon}
      </div>
      <p style={{ fontSize: 15, color: 'var(--color-text-muted)', margin: 0 }}>{text}</p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ProfileTabs({ profileId, initialPosts, isOwner, canSeeContent, currentUserId }: ProfileTabsProps) {
  const [activeTab,   setActiveTab]   = useState<Tab>('posts')
  const [isPending,   startTransition] = useTransition()
  const [loadingMore, setLoadingMore]  = useState(false)

  const [tabData, setTabData] = useState<Record<Tab, TabState>>({
    posts:   { posts: initialPosts, cursor: null, loaded: true },
    replies: { posts: [],           cursor: null, loaded: false },
    media:   { posts: [],           cursor: null, loaded: false },
    likes:   { posts: [],           cursor: null, loaded: false },
  })

  // Likes tab only visible to the profile owner
  const visibleTabs = isOwner ? ALL_TABS : ALL_TABS.filter(t => t.key !== 'likes')

  function switchTab(tab: Tab) {
    if (tab === activeTab) return
    setActiveTab(tab)
    if (tabData[tab].loaded) return
    startTransition(async () => {
      const { posts, nextCursor } = await getProfileTabAction(profileId, tab)
      setTabData(prev => ({ ...prev, [tab]: { posts, cursor: nextCursor, loaded: true } }))
    })
  }

  async function loadMore() {
    const state = tabData[activeTab]
    if (!state.cursor || loadingMore) return
    setLoadingMore(true)
    const { posts: more, nextCursor } = await getProfileTabAction(profileId, activeTab, state.cursor)
    setTabData(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        posts:  [...prev[activeTab].posts, ...more],
        cursor: nextCursor,
      },
    }))
    setLoadingMore(false)
  }

  const state = tabData[activeTab]

  return (
    <div>
      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch' as any,
        marginTop: 16,
      }}>
        {visibleTabs.map(({ key, label }) => {
          const active = activeTab === key
          return (
            <button
              key={key}
              onClick={() => switchTab(key)}
              style={{
                flex: '1 1 0', flexShrink: 0, minWidth: 72,
                padding: '13px 4px',
                background: 'none', border: 'none',
                borderBottom: active ? '2px solid var(--color-brand)' : '2px solid transparent',
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                fontFamily: "'Syne', sans-serif",
                fontWeight: active ? 700 : 500,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'color 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Private / restricted ──────────────────────────────────────────── */}
      {!canSeeContent && (
        <div style={{ padding: '64px 20px', textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
          }}>
            <Lock size={24} color="var(--color-text-muted)" strokeWidth={1.5} />
          </div>
          <p style={{ fontSize: 15, color: 'var(--color-text-muted)', margin: 0 }}>
            Follow this account to see their content.
          </p>
        </div>
      )}

      {/* ── Loading first fetch ───────────────────────────────────────────── */}
      {canSeeContent && isPending && !state.loaded && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '52px 0' }}>
          <Loader size={22} color="var(--color-brand)" style={{ animation: 'spin .8s linear infinite' }} />
        </div>
      )}

      {/* ── Media — 3-column grid ─────────────────────────────────────────── */}
      {canSeeContent && activeTab === 'media' && state.loaded && (
        (state.posts.length === 0)
          ? <Empty tab="media" />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
              {state.posts.map(p => <MediaGridItem key={p.id} post={p} />)}
            </div>
          )
      )}

      {/* ── Posts / Replies / Likes — PostCard list ───────────────────────── */}
      {canSeeContent && activeTab !== 'media' && state.loaded && (
        <>
          {state.posts.length === 0
            ? <Empty tab={activeTab} />
            : state.posts.map(post => <PostCardWithAnalytics key={post.id} post={post as any} currentUserId={currentUserId} />)
          }

          {state.cursor && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0 48px' }}>
              <button
                onClick={loadMore}
                disabled={loadingMore}
                style={{
                  background: 'none',
                  border: '1px solid var(--color-border)',
                  borderRadius: 20,
                  padding: '10px 28px',
                  color: 'var(--color-brand)',
                  fontSize: 14,
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 600,
                  cursor: loadingMore ? 'not-allowed' : 'pointer',
                  opacity: loadingMore ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                {loadingMore && <Loader size={14} style={{ animation: 'spin .7s linear infinite' }} />}
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        div::-webkit-scrollbar { display: none }
      `}</style>
    </div>
  )
}