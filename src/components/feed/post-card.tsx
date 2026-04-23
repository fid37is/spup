'use client'

import { useState, useTransition } from 'react'
import { Heart, MessageCircle, Repeat2, Bookmark, Share2, MoreHorizontal, Trash2 } from 'lucide-react'
import { toggleLikeAction, toggleRepostAction, toggleBookmarkAction, deletePostAction } from '@/lib/actions'
import { formatRelativeTime, formatNumber } from '@/lib/utils'

function Avatar({ name, size = 42 }: { name: string; size?: number }) {
  const colors = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A1A4A', '#4A7A1A']
  const color = colors[name.charCodeAt(0) % colors.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Syne', sans-serif", fontWeight: 800,
      fontSize: size * 0.36, color: 'white',
    }}>
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
    <article
      style={{
        padding: '16px 20px', borderBottom: '1px solid #141414',
        display: 'flex', gap: 12, opacity: isPending ? 0.7 : 1,
        transition: 'opacity 0.15s', position: 'relative',
      }}
    >
      <Avatar name={author?.display_name || 'Spup'} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#F5F5F0', fontFamily: "'Syne', sans-serif" }}>
              {author?.display_name}
            </span>
            {author?.verification_tier !== 'none' && (
              <span style={{ fontSize: 10, background: '#1A7A4A', color: 'white', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>✓</span>
            )}
            <span style={{ fontSize: 14, color: '#555' }}>@{author?.username}</span>
            <span style={{ fontSize: 12, color: '#333' }}>·</span>
            <span style={{ fontSize: 13, color: '#3A3A35' }}>{formatRelativeTime(post.created_at)}</span>
            {post.edited_at && <span style={{ fontSize: 11, color: '#2A2A28' }}>edited</span>}
          </div>

          {/* More menu */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowMenu(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: '2px 4px', borderRadius: 4 }}
            >
              <MoreHorizontal size={16} />
            </button>
            {showMenu && (
              <>
                <div onClick={() => setShowMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                <div style={{
                  position: 'absolute', right: 0, top: 24, zIndex: 20,
                  background: '#181818', border: '1px solid #2A2A2A',
                  borderRadius: 12, padding: '4px', minWidth: 160,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}>
                  <button
                    onClick={handleDelete}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '10px 14px', background: 'none', border: 'none',
                      borderRadius: 8, cursor: 'pointer', color: '#E53935',
                      fontSize: 14, fontFamily: "'DM Sans', sans-serif",
                      transition: 'background 0.12s',
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
            fontSize: 15, color: '#D0D0C8', lineHeight: 1.6,
            marginBottom: post.media?.length ? 12 : 14,
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
            gap: 3, borderRadius: 14, overflow: 'hidden', marginBottom: 14,
            maxHeight: 360,
          }}>
            {(post.media as any[]).slice(0, 4).map((m: any, i: number) => (
              <div key={m.id} style={{
                background: '#1A1A1A',
                aspectRatio: post.media.length === 1 ? '16/9' : '1/1',
                gridColumn: post.media.length === 3 && i === 0 ? '1 / -1' : undefined,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {m.media_type === 'image'
                  ? <img src={m.url} alt={m.alt_text || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 12, color: '#555' }}>Video</span>
                }
              </div>
            ))}
          </div>
        )}

        {/* Action bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 2 }}>
          {/* Comments */}
          <ActionBtn
            icon={<MessageCircle size={17} />}
            count={post.comments_count}
            active={false}
            activeColor="#378ADD"
            onClick={() => {}}
          />

          {/* Repost */}
          <ActionBtn
            icon={<Repeat2 size={17} />}
            count={repostCount}
            active={reposted}
            activeColor="#22A861"
            onClick={handleRepost}
          />

          {/* Like */}
          <ActionBtn
            icon={<Heart size={17} fill={liked ? '#E24B4A' : 'none'} />}
            count={likeCount}
            active={liked}
            activeColor="#E24B4A"
            onClick={handleLike}
          />

          {/* Bookmark */}
          <ActionBtn
            icon={<Bookmark size={17} fill={bookmarked ? '#D4A017' : 'none'} />}
            count={null}
            active={bookmarked}
            activeColor="#D4A017"
            onClick={handleBookmark}
          />

          {/* Share — push to right */}
          <button
            onClick={handleShare}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#555', padding: '6px 4px', borderRadius: 6,
              transition: 'color 0.12s',
            }}
          >
            <Share2 size={15} />
          </button>
        </div>
      </div>
    </article>
  )
}

function ActionBtn({
  icon, count, active, activeColor, onClick,
}: {
  icon: React.ReactNode
  count: number | null
  active: boolean
  activeColor: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: 'none', border: 'none', cursor: 'pointer',
        color: active ? activeColor : '#555',
        padding: '6px 10px 6px 0',
        fontSize: 13, fontFamily: "'DM Sans', sans-serif",
        transition: 'color 0.12s',
      }}
    >
      {icon}
      {count !== null && count > 0 && (
        <span style={{ minWidth: 16 }}>{formatNumber(count)}</span>
      )}
    </button>
  )
}
