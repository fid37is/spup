'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Heart, MessageCircle, Repeat2, Bookmark, Share2, MoreHorizontal, Trash2 } from 'lucide-react'
import { toggleLikeAction, toggleRepostAction, toggleBookmarkAction, deletePostAction } from '@/lib/actions'
import { formatRelativeTime, formatNumber } from '@/lib/utils'

function Avatar({
  name, size = 42, username, clickable = false,
}: {
  name: string; size?: number; username?: string; clickable?: boolean
}) {
  const router = useRouter()
  const colors = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A1A4A', '#4A7A1A']
  const color = colors[name.charCodeAt(0) % colors.length]
  return (
    <div
      onClick={clickable && username ? (e) => { e.stopPropagation(); router.push(`/user/${username}`) } : undefined}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Syne', sans-serif", fontWeight: 800,
        fontSize: size * 0.36, color: 'white',
        cursor: clickable && username ? 'pointer' : 'default',
        transition: 'opacity 0.12s',
      }}
      onMouseEnter={e => { if (clickable) e.currentTarget.style.opacity = '0.8' }}
      onMouseLeave={e => { if (clickable) e.currentTarget.style.opacity = '1' }}
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}

export default function PostCard({ post }: { post: any }) {
  const [isPending, startTransition] = useTransition()
  const [liked, setLiked] = useState(post.is_liked)
  const [likeCount, setLikeCount] = useState(post.likes_count)
  const [reposted, setReposted] = useState(post.is_reposted)
  const [repostCount, setRepostCount] = useState(post.reposts_count)
  const [bookmarked, setBookmarked] = useState(post.is_bookmarked)
  const [showMenu, setShowMenu] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const router = useRouter()

  const author = post.author
  if (deleted) return null

  function handleLike() {
    setLiked((v: boolean) => !v)
    setLikeCount((c: number) => liked ? c - 1 : c + 1)
    startTransition(async () => {
      const result = await toggleLikeAction(post.id)
      if ('error' in result) {
        setLiked((v: boolean) => !v)
        setLikeCount((c: number) => liked ? c + 1 : c - 1)
      }
    })
  }

  function handleRepost() {
    setReposted((v: boolean) => !v)
    setRepostCount((c: number) => reposted ? c - 1 : c + 1)
    startTransition(async () => {
      const result = await toggleRepostAction(post.id)
      if ('error' in result) {
        setReposted((v: boolean) => !v)
        setRepostCount((c: number) => reposted ? c + 1 : c - 1)
      }
    })
  }

  function handleBookmark() {
    setBookmarked((v: boolean) => !v)
    startTransition(async () => { await toggleBookmarkAction(post.id) })
  }

  function handleDelete() {
    setShowMenu(false)
    startTransition(async () => {
      const result = await deletePostAction(post.id)
      if (!('error' in result)) setDeleted(true)
    })
  }

  async function handleShare() {
    const url = `${window.location.origin}/post/${post.id}`
    if (navigator.share) {
      await navigator.share({ text: post.body || '', url })
    } else {
      await navigator.clipboard.writeText(url)
    }
  }

  return (
    <article style={{
      padding: '14px 16px',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex', gap: 12,
      opacity: isPending ? 0.7 : 1,
      transition: 'opacity 0.15s',
      position: 'relative',
    }}>
      {/* Clickable avatar */}
      <Avatar
        name={author?.display_name || 'Spup'}
        username={author?.username}
        clickable
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            {/* Clickable display name */}
            <span
              onClick={() => author?.username && router.push(`/user/${author.username}`)}
              style={{
                fontWeight: 700, fontSize: 15,
                color: 'var(--color-text-primary)',
                fontFamily: "'Syne', sans-serif",
                cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
            >
              {author?.display_name}
            </span>
            {author?.verification_tier !== 'none' && (
              <span style={{
                fontSize: 10, background: 'var(--color-brand)',
                color: 'white', padding: '1px 5px', borderRadius: 4, fontWeight: 700,
              }}>✓</span>
            )}
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>@{author?.username}</span>
            <span style={{ fontSize: 12, color: 'var(--color-border-light)' }}>·</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{formatRelativeTime(post.created_at)}</span>
            {post.edited_at && <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>edited</span>}
          </div>

          {/* More menu */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setShowMenu(v => !v)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-muted)', padding: '4px 6px',
                borderRadius: 6, lineHeight: 1,
              }}
            >
              <MoreHorizontal size={16} />
            </button>
            {showMenu && (
              <>
                <div onClick={() => setShowMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                <div style={{
                  position: 'absolute', right: 0, top: 28, zIndex: 20,
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 12, padding: 4, minWidth: 160,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                }}>
                  <button
                    onClick={handleDelete}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '10px 14px',
                      background: 'none', border: 'none',
                      borderRadius: 8, cursor: 'pointer',
                      color: 'var(--color-error)', fontSize: 14,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    <Trash2 size={15} /> Delete post
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        {post.body && (
          <p style={{
            fontSize: 15, color: 'var(--color-text-primary)',
            lineHeight: 1.6, marginBottom: post.media?.length ? 12 : 10,
            wordBreak: 'break-word', whiteSpace: 'pre-wrap',
          }}>
            {post.body}
          </p>
        )}

        {/* Media grid */}
        {post.media && post.media.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: post.media.length === 1 ? '1fr' : 'repeat(2, 1fr)',
            gap: 3, borderRadius: 14, overflow: 'hidden', marginBottom: 10,
            maxHeight: 400,
          }}>
            {(post.media as any[]).slice(0, 4).map((m: any, i: number) => (
              <div key={m.id || i} style={{
                background: 'var(--color-surface-2)',
                aspectRatio: post.media.length === 1 ? '16/9' : '1/1',
                gridColumn: post.media.length === 3 && i === 0 ? '1 / -1' : undefined,
                overflow: 'hidden',
              }}>
                {m.media_type === 'image'
                  ? <img src={m.url} alt={m.alt_text || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (
                    <video
                      src={m.url}
                      controls
                      playsInline
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  )
                }
              </div>
            ))}
          </div>
        )}

        {/* Action bar — spaced evenly like X/Twitter */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 6,
          maxWidth: 380,
        }}>
          <ActionBtn
            icon={<MessageCircle size={18} />}
            count={post.comments_count}
            active={false}
            activeColor="#378ADD"
            onClick={() => router.push(`/post/${post.id}`)}
            label="Reply"
          />
          <ActionBtn
            icon={<Repeat2 size={18} />}
            count={repostCount}
            active={reposted}
            activeColor="#22A861"
            onClick={handleRepost}
            label="Repost"
          />
          <ActionBtn
            icon={<Heart size={18} fill={liked ? '#E24B4A' : 'none'} />}
            count={likeCount}
            active={liked}
            activeColor="#E24B4A"
            onClick={handleLike}
            label="Like"
          />
          <ActionBtn
            icon={<Bookmark size={18} fill={bookmarked ? '#D4A017' : 'none'} />}
            count={null}
            active={bookmarked}
            activeColor="#D4A017"
            onClick={handleBookmark}
            label="Save"
          />
          <ActionBtn
            icon={<Share2 size={18} />}
            count={null}
            active={false}
            activeColor="var(--color-brand)"
            onClick={handleShare}
            label="Share"
          />
        </div>
      </div>
    </article>
  )
}

function ActionBtn({
  icon, count, active, activeColor, onClick, label,
}: {
  icon: React.ReactNode
  count: number | null
  active: boolean
  activeColor: string
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: 'none', border: 'none', cursor: 'pointer',
        color: active ? activeColor : 'var(--color-text-muted)',
        padding: '7px 8px', borderRadius: 8,
        fontSize: 13, fontFamily: "'DM Sans', sans-serif",
        transition: 'color 0.12s, background 0.12s',
        WebkitTapHighlightColor: 'transparent',
        minWidth: 44, minHeight: 44, // mobile touch target
        justifyContent: 'center',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
    >
      {icon}
      {count !== null && count > 0 && (
        <span>{formatNumber(count)}</span>
      )}
    </button>
  )
}