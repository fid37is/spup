'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ThumbsUp, ThumbsDown, MessageCircle, Repeat2, Bookmark, Share2, MoreHorizontal, Trash2, Quote, BarChart2 } from 'lucide-react'
import { toggleLikeAction, toggleDislikeAction, toggleRepostAction, toggleBookmarkAction, deletePostAction, createPostAction } from '@/lib/actions'
import { formatRelativeTime, formatNumber } from '@/lib/utils'

/* ── Avatar ─────────────────────────────────────────────────────────────── */
function Avatar({ name, avatarUrl, size = 42, username, clickable = false }: {
  name: string; avatarUrl?: string | null; size?: number; username?: string; clickable?: boolean
}) {
  const router = useRouter()
  const colors = ['#1A7A4A','#7A3A1A','#1A4A7A','#4A1A7A','#7A1A4A','#4A7A1A']
  const color = colors[name.charCodeAt(0) % colors.length]
  return (
    <div
      onClick={clickable && username ? e => { e.stopPropagation(); router.push(`/user/${username}`) } : undefined}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: avatarUrl ? 'transparent' : color, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: size * 0.36, color: 'white',
        cursor: clickable && username ? 'pointer' : 'default',
        transition: 'opacity 0.12s',
      }}
      onMouseEnter={e => { if (clickable) e.currentTarget.style.opacity = '0.8' }}
      onMouseLeave={e => { if (clickable) e.currentTarget.style.opacity = '1' }}
    >
      {avatarUrl
        ? <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : name.slice(0, 2).toUpperCase()
      }
    </div>
  )
}

/* ── Quote modal ─────────────────────────────────────────────────────────── */
function QuoteModal({ post, onClose }: { post: any; onClose: () => void }) {
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function handleQuote() {
    if (!body.trim()) { setError('Add something to your quote.'); return }
    startTransition(async () => {
      const result = await createPostAction({ body: body.trim(), quoted_post_id: post.id })
      if ('error' in result && result.error) { setError(result.error); return }
      onClose()
    })
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--overlay-bg)', zIndex: 200 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 'min(560px, 95vw)',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: 20, padding: 20, zIndex: 201,
        animation: 'modalIn 0.18s ease',
      }}>
        <h3 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 16 }}>
          Quote post
        </h3>
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 14, padding: '12px 14px', marginBottom: 14, background: 'var(--color-surface-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Avatar name={post.author?.display_name || 'S'} avatarUrl={post.author?.avatar_url} size={26} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif" }}>{post.author?.display_name}</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>@{post.author?.username}</span>
          </div>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5, wordBreak: 'break-word' }}>{post.body}</p>
        </div>
        <textarea autoFocus value={body} onChange={e => { setBody(e.target.value); setError('') }}
          placeholder="Add your comment…" maxLength={500} rows={3}
          style={{ width: '100%', background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '12px 14px', fontSize: 15, color: 'var(--color-text-primary)', fontFamily: "'DM Sans',sans-serif", resize: 'none', outline: 'none', boxSizing: 'border-box' }}
        />
        {error && <p style={{ fontSize: 13, color: 'var(--color-error)', marginTop: 6 }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{500 - body.length} chars left</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 20, border: '1px solid var(--color-border)', background: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
            <button onClick={handleQuote} disabled={isPending || !body.trim()} style={{ padding: '9px 18px', borderRadius: 20, border: 'none', background: body.trim() ? 'var(--color-brand)' : 'var(--color-surface-2)', color: body.trim() ? 'white' : 'var(--color-text-muted)', cursor: body.trim() ? 'pointer' : 'not-allowed', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14 }}>
              {isPending ? 'Quoting…' : 'Quote'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── PostCard ────────────────────────────────────────────────────────────── */
export default function PostCard({ post, onReplyClick }: { post: any; onReplyClick?: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [liked, setLiked] = useState(post.is_liked)
  const [likeCount, setLikeCount] = useState(post.likes_count)
  const [disliked, setDisliked] = useState(post.is_disliked)
  const [dislikeCount, setDislikeCount] = useState(post.dislikes_count || 0)
  const [reposted, setReposted] = useState(post.is_reposted)
  const [repostCount, setRepostCount] = useState(post.reposts_count)
  const [bookmarked, setBookmarked] = useState(post.is_bookmarked)
  const [showMenu, setShowMenu] = useState(false)
  const [showRepostMenu, setShowRepostMenu] = useState(false)
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const router = useRouter()
  const repostRef = useRef<HTMLDivElement>(null)


  // Close repost menu on outside click
  useEffect(() => {
    if (!showRepostMenu) return
    const handler = (e: MouseEvent) => {
      if (repostRef.current && !repostRef.current.contains(e.target as Node)) setShowRepostMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showRepostMenu])

  const author = post.author
  if (deleted) return null

  function handleLike() {
    const wasLiked = liked
    const wasDisliked = disliked
    // If currently disliked, undo dislike first
    if (wasDisliked) { setDisliked(false); setDislikeCount((c: number) => Math.max(0, c - 1)) }
    setLiked(!wasLiked)
    setLikeCount((c: number) => wasLiked ? c - 1 : c + 1)
    startTransition(async () => {
      const result = await toggleLikeAction(post.id)
      if ('error' in result) {
        if (wasDisliked) { setDisliked(true); setDislikeCount((c: number) => c + 1) }
        setLiked(wasLiked)
        setLikeCount((c: number) => wasLiked ? c + 1 : c - 1)
      }
    })
  }

  function handleDislike() {
    const wasDisliked = disliked
    const wasLiked = liked
    // If currently liked, undo like first
    if (wasLiked) { setLiked(false); setLikeCount((c: number) => Math.max(0, c - 1)) }
    setDisliked(!wasDisliked)
    setDislikeCount((c: number) => wasDisliked ? c - 1 : c + 1)
    startTransition(async () => {
      const result = await toggleDislikeAction(post.id)
      if ('error' in result) {
        if (wasLiked) { setLiked(true); setLikeCount((c: number) => c + 1) }
        setDisliked(wasDisliked)
        setDislikeCount((c: number) => wasDisliked ? c + 1 : c - 1)
      }
    })
  }

  function handleRepost() {
    const wasReposted = reposted
    setShowRepostMenu(false)
    setReposted(!wasReposted)
    setRepostCount((c: number) => wasReposted ? c - 1 : c + 1)
    startTransition(async () => {
      const result = await toggleRepostAction(post.id)
      if ('error' in result) {
        setReposted(wasReposted)
        setRepostCount((c: number) => wasReposted ? c + 1 : c - 1)
      }
    })
  }

  function handleBookmark() {
    setBookmarked((v: boolean) => !v)
    startTransition(async () => {
      const result = await toggleBookmarkAction(post.id)
      if ('error' in result) setBookmarked((v: boolean) => !v)
    })
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
    if (navigator.share) await navigator.share({ text: post.body || '', url })
    else await navigator.clipboard.writeText(url)
  }

  return (
    <>
      <article style={{
        padding: '14px 16px', borderBottom: '1px solid var(--color-border)',
        display: 'flex', gap: 12, opacity: isPending ? 0.7 : 1, transition: 'opacity 0.15s',
      }}>
        <Avatar name={author?.display_name || 'S'} avatarUrl={author?.avatar_url} username={author?.username} clickable />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
              <span
                onClick={() => author?.username && router.push(`/user/${author.username}`)}
                style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif", cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
              >
                {author?.display_name}
              </span>
              {author?.verification_tier !== 'none' && (
                <span style={{ fontSize: 10, background: 'var(--color-brand)', color: 'white', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>✓</span>
              )}
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>@{author?.username}</span>
              <span style={{ fontSize: 12, color: 'var(--color-border-light)' }}>·</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{formatRelativeTime(post.created_at)}</span>
              {post.edited_at && <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>· edited</span>}
            </div>

            {/* More menu */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button onClick={() => setShowMenu(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '4px 6px', borderRadius: 6 }}>
                <MoreHorizontal size={16} />
              </button>
              {showMenu && (
                <>
                  <div onClick={() => setShowMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                  <div style={{ position: 'absolute', right: 0, top: 28, zIndex: 20, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 4, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                    <button onClick={handleDelete} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'var(--color-error)', fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}>
                      <Trash2 size={15} /> Delete post
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Body */}
          {post.body && (
            <p style={{ fontSize: 15, color: 'var(--color-text-primary)', lineHeight: 1.6, marginBottom: post.media?.length ? 12 : 10, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
              {post.body}
            </p>
          )}

          {/* Quoted post */}
          {post.quoted_post && (
            <div onClick={() => router.push(`/post/${post.quoted_post.id}`)}
              style={{ border: '1px solid var(--color-border)', borderRadius: 14, padding: '10px 12px', marginBottom: 10, cursor: 'pointer', background: 'var(--color-surface-2)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Avatar name={post.quoted_post.author?.display_name || 'S'} avatarUrl={post.quoted_post.author?.avatar_url} size={20} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif" }}>{post.quoted_post.author?.display_name}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>@{post.quoted_post.author?.username}</span>
              </div>
              <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{post.quoted_post.body}</p>
            </div>
          )}

          {/* Media */}
          {post.media && post.media.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: post.media.length === 1 ? '1fr' : 'repeat(2,1fr)', gap: 3, borderRadius: 14, overflow: 'hidden', marginBottom: 10, maxHeight: 400 }}>
              {(post.media as any[]).slice(0, 4).map((m: any, i: number) => (
                <div key={m.id || i} style={{ background: 'var(--color-surface-2)', aspectRatio: post.media.length === 1 ? '16/9' : '1/1', gridColumn: post.media.length === 3 && i === 0 ? '1/-1' : undefined, overflow: 'hidden' }}>
                  {m.media_type === 'image'
                    ? <img src={m.url} alt={m.alt_text || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <video src={m.url} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  }
                </div>
              ))}
            </div>
          )}

          {/* Action bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, width: '100%', maxWidth: 480 }}>

            {/* Reply */}
            <ActionBtn icon={<MessageCircle size={18} />} count={post.comments_count} showZero active={false} activeColor="#378ADD" onClick={() => onReplyClick ? onReplyClick() : router.push(`/post/${post.id}`)} label="Reply" />

            {/* Repost with dropdown */}
            <div ref={repostRef} style={{ position: 'relative' }}>
              <ActionBtn icon={<Repeat2 size={18} />} count={repostCount} active={reposted} activeColor="var(--color-brand)" onClick={() => setShowRepostMenu(v => !v)} label="Repost" />
              {showRepostMenu && (
                <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, zIndex: 30, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 6, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
                  <button onClick={handleRepost} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', color: reposted ? 'var(--color-brand)' : 'var(--color-text-primary)', fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}>
                    <Repeat2 size={16} /> {reposted ? 'Undo repost' : 'Repost'}
                  </button>
                  <button onClick={() => { setShowRepostMenu(false); setShowQuoteModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'var(--color-text-primary)', fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}>
                    <Quote size={16} /> Quote post
                  </button>
                </div>
              )}
            </div>

            {/* Thumbs up */}
            <ActionBtn icon={<ThumbsUp size={18} fill={liked ? 'var(--color-brand)' : 'none'} />} count={likeCount} active={liked} activeColor="var(--color-brand)" onClick={handleLike} label="Like" />

            {/* Thumbs down */}
            <ActionBtn icon={<ThumbsDown size={18} fill={disliked ? 'var(--color-error)' : 'none'} />} count={dislikeCount} active={disliked} activeColor="var(--color-error)" onClick={handleDislike} label="Dislike" />

            {/* Analytics — display only, no navigation */}
            <ActionBtn icon={<BarChart2 size={18} />} count={post.impressions_count} active={false} activeColor="var(--color-text-secondary)" onClick={() => {}} label="Impressions" />

            {/* Bookmark */}
            <ActionBtn icon={<Bookmark size={18} fill={bookmarked ? 'var(--color-gold)' : 'none'} />} count={null} active={bookmarked} activeColor="var(--color-gold)" onClick={handleBookmark} label="Save" />

            {/* Share */}
            <ActionBtn icon={<Share2 size={18} />} count={null} active={false} activeColor="var(--color-brand)" onClick={handleShare} label="Share" />
          </div>
        </div>
      </article>

      {showQuoteModal && <QuoteModal post={post} onClose={() => setShowQuoteModal(false)} />}
    </>
  )
}

/* ── ActionBtn ───────────────────────────────────────────────────────────── */
function ActionBtn({ icon, count, active, activeColor, onClick, label, showZero = false }: {
  icon: React.ReactNode; count: number | null; active: boolean; activeColor: string; onClick: () => void; label: string; showZero?: boolean
}) {
  return (
    <button onClick={onClick} aria-label={label} style={{
      display: 'flex', alignItems: 'center', gap: 4,
      background: 'none', border: 'none', cursor: 'pointer',
      color: active ? activeColor : 'var(--color-text-muted)',
      padding: '6px 6px', borderRadius: 8, fontSize: 13,
      fontFamily: "'DM Sans',sans-serif", transition: 'color 0.12s, background 0.12s',
      WebkitTapHighlightColor: 'transparent',
      minWidth: 36, minHeight: 44, justifyContent: 'center',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
    >
      {icon}
      <span style={{ fontSize: 12, minWidth: 16 }}>{count !== null ? (count > 0 ? formatNumber(count) : showZero ? '0' : '') : ''}</span>
    </button>
  )
}