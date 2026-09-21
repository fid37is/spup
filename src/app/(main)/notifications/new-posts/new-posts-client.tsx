// src/app/(main)/notifications/new-posts/new-posts-client.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Settings } from 'lucide-react'
import PostCardWithAnalytics from '@/components/feed/post-card-with-analytics'
import { NotifAvatar } from '@/components/notifications/avatar'
import { markNewPostsReadAction, type NewPostUser } from '@/lib/actions/notifications'
import type { FeedPost } from '@/lib/actions/feed'

export default function NewPostsClient({
  posts, users, currentUserId, initialUsername,
}: {
  posts: FeedPost[]
  users: NewPostUser[]
  currentUserId?: string
  initialUsername: string | null
}) {
  const [selected, setSelected] = useState<string | null>(
    initialUsername && users.some(u => u.username.toLowerCase() === initialUsername.toLowerCase())
      ? initialUsername.toLowerCase()
      : null,
  )
  // Remember which people were unread when the page opened, so their ring
  // doesn't vanish the instant we mark everything read below.
  const [unreadAtOpen] = useState(() => new Set(users.filter(u => u.unread > 0).map(u => u.id)))

  // Opening the view counts as reading these notifications (clears the badge).
  useEffect(() => { void markNewPostsReadAction() }, [])

  const visible = selected
    ? posts.filter(p => p.author.username.toLowerCase() === selected)
    : posts

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        background: 'var(--nav-bg)', borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px', height: 53 }}>
          <Link
            href="/notifications"
            aria-label="Back to notifications"
            style={{
              width: 38, height: 38, borderRadius: '50%', color: 'var(--color-text-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ArrowLeft size={20} />
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18,
              color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.2,
            }}>
              New posts
            </h1>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              From people you get post notifications for
            </div>
          </div>
          <Link
            href="/notifications/settings/post-notifications"
            aria-label="Manage post notifications"
            style={{
              width: 38, height: 38, borderRadius: '50%', color: 'var(--color-text-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Settings size={20} />
          </Link>
        </div>

        {/* People who just posted */}
        {users.length > 0 && (
          <div style={{
            display: 'flex', gap: 14, overflowX: 'auto', padding: '10px 16px 12px',
            scrollbarWidth: 'none',
          }}>
            <PersonChip
              label="All" active={selected === null}
              onClick={() => setSelected(null)}
              badge={posts.length}
              avatar={
                <div style={{
                  width: 52, height: 52, borderRadius: '50%', background: 'var(--color-brand-muted)',
                  border: '1px solid var(--color-brand-border)', color: 'var(--color-brand)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15,
                }}>All</div>
              }
            />
            {users.map(u => (
              <PersonChip
                key={u.id}
                label={u.display_name.split(' ')[0]}
                active={selected === u.username.toLowerCase()}
                onClick={() => setSelected(prev => prev === u.username.toLowerCase() ? null : u.username.toLowerCase())}
                badge={u.count}
                avatar={<NotifAvatar name={u.display_name} url={u.avatar_url} size={52} ring={unreadAtOpen.has(u.id)} />}
              />
            ))}
          </div>
        )}
      </div>

      {/* Posts, exactly like the feed */}
      {visible.map(post => (
        <PostCardWithAnalytics key={post.id} post={post} currentUserId={currentUserId} />
      ))}

      {visible.length === 0 && (
        <div style={{ padding: '72px 32px', textAlign: 'center' }}>
          <h3 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22,
            color: 'var(--color-text-primary)', margin: '0 0 8px',
          }}>
            No new posts
          </h3>
          <p style={{ margin: '0 auto', maxWidth: 340, fontSize: 15, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
            When someone you get post notifications for posts, it will show up here.
          </p>
        </div>
      )}

      {visible.length > 0 && (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-faint)' }}>You&apos;re all caught up</p>
        </div>
      )}
    </div>
  )
}

function PersonChip({
  label, avatar, badge, active, onClick,
}: {
  label: string
  avatar: React.ReactNode
  badge: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        width: 64, padding: 0, opacity: active ? 1 : 0.85,
      }}
    >
      <div style={{ position: 'relative', padding: 3, borderRadius: '50%', border: `2px solid ${active ? 'var(--color-text-primary)' : 'transparent'}` }}>
        {avatar}
        {badge > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10,
            background: 'var(--color-brand)', color: 'white', border: '2px solid var(--color-bg)',
            fontSize: 11, fontWeight: 800, padding: '0 4px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span style={{
        fontSize: 12, fontWeight: active ? 700 : 500, maxWidth: 64,
        color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    </button>
  )
}
