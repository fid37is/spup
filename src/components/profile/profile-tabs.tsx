'use client'

/**
 * ProfileTabs
 * ────────────
 * Horizontally-scrollable tab bar + lazy-loaded content for profile pages.
 *
 * Tabs:
 *   Posts    — top-level posts by this user
 *   Replies  — all their replies / comments
 *   Mutuals  — people who follow each other with this user (user cards)
 *   Media    — posts with images or video (2-column grid)
 *   Likes    — posts this user has liked (own profile only)
 *
 * Data for the active tab is loaded on first visit via server actions.
 * Subsequent "Load more" appends with cursor-based pagination.
 */

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader } from 'lucide-react'
import PostCard from '@/components/feed/post-card'
import { getProfileTabAction, getProfileMutualsAction } from '@/lib/actions/feed'
import type { FeedPost, MutualUser } from '@/lib/actions/feed'

type Tab = 'posts' | 'replies' | 'mutuals' | 'media' | 'likes'

interface TabState {
  posts?: FeedPost[]
  users?: MutualUser[]
  cursor?: string | null
  loaded: boolean
}

interface ProfileTabsProps {
  profileId: string        // whose profile this is
  initialPosts: FeedPost[] // SSR'd posts for the 'posts' tab
  isOwner: boolean         // show Likes tab only for own profile
  canSeeContent: boolean   // false if private + not following
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'posts',   label: 'Posts'   },
  { key: 'replies', label: 'Replies' },
  { key: 'mutuals', label: 'Mutuals' },
  { key: 'media',   label: 'Media'   },
  { key: 'likes',   label: 'Likes'   },
]

// ── Avatar (mini, for mutual cards) ────────────────────────────────────────────
function MiniAvatar({ name, avatarUrl, size = 44 }: { name: string; avatarUrl: string | null; size?: number }) {
  const COLORS = ['#1A7A4A','#7A3A1A','#1A4A7A','#4A1A7A','#7A1A4A']
  const bg = COLORS[name.charCodeAt(0) % COLORS.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: avatarUrl ? 'transparent' : bg,
      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: size * 0.38, color: 'white',
    }}>
      {avatarUrl
        ? <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : name.slice(0, 2).toUpperCase()
      }
    </div>
  )
}

// ── Mutual user card ────────────────────────────────────────────────────────────
function MutualCard({ user }: { user: MutualUser }) {
  const router = useRouter()
  return (
    <div
      onClick={() => router.push(`/user/${user.username}`)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 20px',
        borderBottom: '1px solid var(--color-border)',
        cursor: 'pointer',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-2)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '' }}
    >
      <MiniAvatar name={user.display_name} avatarUrl={user.avatar_url} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
            color: 'var(--color-text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user.display_name}
          </span>
          {user.verification_tier !== 'none' && (
            <span style={{
              width: 16, height: 16, borderRadius: '50%',
              background: 'var(--color-brand)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, color: 'white', flexShrink: 0,
            }}>✓</span>
          )}
          {user.is_monetised && (
            <span style={{
              fontSize: 9, background: 'var(--color-gold)', color: '#000',
              padding: '1px 5px', borderRadius: 3, fontWeight: 700, flexShrink: 0,
            }}>PRO</span>
          )}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 1 }}>
          @{user.username} · {user.followers_count.toLocaleString()} followers
        </div>
      </div>
    </div>
  )
}

// ── Media grid item ────────────────────────────────────────────────────────────
function MediaGridItem({ post }: { post: FeedPost }) {
  const router = useRouter()
  const media = post.media?.[0]
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
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0.85' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1' }}
    >
      {media.media_type === 'video' ? (
        <>
          <img
            src={media.thumbnail_url || media.url}
            alt="Video"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.25)',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: 'white', fontSize: 14, marginLeft: 3 }}>▶</span>
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

// ── Empty state ───────────────────────────────────────────────────────────────
function Empty({ tab }: { tab: Tab }) {
  const config: Record<Tab, { icon: string; text: string }> = {
    posts:   { icon: '✍️', text: 'No posts yet'           },
    replies: { icon: '💬', text: 'No replies yet'         },
    mutuals: { icon: '🤝', text: 'No mutual connections'  },
    media:   { icon: '🖼️', text: 'No media posts yet'     },
    likes:   { icon: '❤️', text: 'No liked posts yet'     },
  }
  const { icon, text } = config[tab]
  return (
    <div style={{ padding: '60px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <p style={{ fontSize: 15, color: 'var(--color-text-muted)' }}>{text}</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProfileTabs({
  profileId,
  initialPosts,
  isOwner,
  canSeeContent,
}: ProfileTabsProps) {
  const tabBarRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab]   = useState<Tab>('posts')
  const [isPending, startTransition] = useTransition()
  const [tabData, setTabData] = useState<Record<Tab, TabState>>({
    posts:   { posts: initialPosts, cursor: null, loaded: true },
    replies: { loaded: false },
    mutuals: { loaded: false },
    media:   { loaded: false },
    likes:   { loaded: false },
  })
  const [loadingMore, setLoadingMore] = useState(false)

  const visibleTabs = isOwner ? TABS : TABS.filter(t => t.key !== 'likes')

  function switchTab(tab: Tab) {
    if (tab === activeTab) return
    setActiveTab(tab)

    // Already loaded — nothing to do
    if (tabData[tab].loaded) return

    startTransition(async () => {
      if (tab === 'mutuals') {
        const users = await getProfileMutualsAction(profileId)
        setTabData(prev => ({ ...prev, mutuals: { users, loaded: true } }))
      } else {
        const { posts, nextCursor } = await getProfileTabAction(profileId, tab)
        setTabData(prev => ({ ...prev, [tab]: { posts, cursor: nextCursor, loaded: true } }))
      }
    })
  }

  async function loadMore() {
    const state = tabData[activeTab]
    if (!state.cursor || loadingMore) return
    setLoadingMore(true)
    const { posts: more, nextCursor } = await getProfileTabAction(profileId, activeTab as any, state.cursor)
    setTabData(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        posts: [...(prev[activeTab].posts || []), ...more],
        cursor: nextCursor,
      },
    }))
    setLoadingMore(false)
  }

  const state = tabData[activeTab]

  return (
    <div>
      {/* ── Tab bar — horizontally scrollable ────────────────────────────── */}
      <div
        ref={tabBarRef}
        style={{
          display: 'flex',
          borderTop: '1px solid var(--color-border)',
          borderBottom: '1px solid var(--color-border)',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          marginTop: 16,
        }}
      >
        {visibleTabs.map(({ key, label }) => {
          const active = activeTab === key
          return (
            <button
              key={key}
              onClick={() => switchTab(key)}
              style={{
                flexShrink: 0,
                flex: '1 1 0',
                minWidth: 72,
                padding: '13px 4px',
                background: 'none',
                border: 'none',
                borderBottom: active
                  ? '2px solid var(--color-brand)'
                  : '2px solid transparent',
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

      {/* ── Tab content ──────────────────────────────────────────────────── */}

      {/* Private / restricted */}
      {!canSeeContent && (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: 'var(--color-text-muted)' }}>
            Follow this account to see their content.
          </p>
        </div>
      )}

      {/* Loading first fetch */}
      {canSeeContent && isPending && !state.loaded && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Loader size={24} color="var(--color-brand)" style={{ animation: 'spin .8s linear infinite' }} />
        </div>
      )}

      {/* Mutuals tab — user cards */}
      {canSeeContent && activeTab === 'mutuals' && state.loaded && (
        <>
          {(state.users?.length ?? 0) === 0
            ? <Empty tab="mutuals" />
            : state.users!.map(u => <MutualCard key={u.id} user={u} />)
          }
        </>
      )}

      {/* Media tab — 2-column grid */}
      {canSeeContent && activeTab === 'media' && state.loaded && (
        <>
          {(state.posts?.length ?? 0) === 0
            ? <Empty tab="media" />
            : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 2,
              }}>
                {state.posts!.map(p => <MediaGridItem key={p.id} post={p} />)}
              </div>
            )
          }
        </>
      )}

      {/* Posts / Replies / Likes tabs — PostCard list */}
      {canSeeContent && (activeTab === 'posts' || activeTab === 'replies' || activeTab === 'likes') && state.loaded && (
        <>
          {(state.posts?.length ?? 0) === 0
            ? <Empty tab={activeTab} />
            : state.posts!.map(post => <PostCard key={post.id} post={post as any} />)
          }

          {/* Load more */}
          {state.cursor && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0 40px' }}>
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
                {loadingMore
                  ? <Loader size={14} style={{ animation: 'spin .7s linear infinite' }} />
                  : null
                }
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