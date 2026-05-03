'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  MessageCircle, Repeat2, ThumbsUp, ThumbsDown,
  Bookmark, Share2, MoreHorizontal, Trash2, Quote, Flag, BarChart2,
} from 'lucide-react'
import {
  toggleLikeAction,
  toggleDislikeAction,
  toggleRepostAction,
  toggleBookmarkAction,
  deletePostAction,
  createPostAction,
  recordImpressionAction,
} from '@/lib/actions'
import { formatRelativeTime, formatNumber } from '@/lib/utils'
import type { FeedPost } from '@/lib/actions/feed'
import { useToast } from '@/components/layout/toast'

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({
  name, avatarUrl, size = 42, username, clickable = false,
}: {
  name: string
  avatarUrl?: string | null
  size?: number
  username?: string
  clickable?: boolean
}) {
  const router = useRouter()
  const colors = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A1A4A', '#4A7A1A']
  const color = colors[name.charCodeAt(0) % colors.length]
  return (
    <div
      onClick={
        clickable && username
          ? e => { e.stopPropagation(); router.push(`/user/${username}`) }
          : undefined
      }
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: avatarUrl ? 'transparent' : color, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Syne',sans-serif", fontWeight: 800,
        fontSize: size * 0.36, color: 'white',
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

// ── MediaRow ──────────────────────────────────────────────────────────────────
function MediaRow({ media }: { media: FeedPost['media'] }) {
  if (!media || media.length === 0) return null
  const sorted = [...media].sort((a, b) => a.position - b.position)
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: sorted.length === 1 ? '1fr' : 'repeat(2,1fr)',
      gap: 3, borderRadius: 14, overflow: 'hidden',
      marginBottom: 10, maxHeight: 420,
    }}>
      {sorted.slice(0, 4).map((m, i) => (
        <div
          key={m.id || i}
          style={{
            background: 'var(--color-surface-2)',
            aspectRatio: sorted.length === 1 ? '16/9' : '1/1',
            gridColumn: sorted.length === 3 && i === 0 ? '1/-1' : undefined,
            overflow: 'hidden',
          }}
        >
          {m.media_type === 'image'
            ? <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <video src={m.url} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          }
        </div>
      ))}
    </div>
  )
}

// ── QuoteModal ────────────────────────────────────────────────────────────────
function QuoteModal({ post, onClose }: { post: FeedPost; onClose: () => void }) {
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const { success, error: toastError } = useToast()

  function handleQuote() {
    if (!body.trim()) { setError('Add something to your quote.'); return }
    startTransition(async () => {
      const result = await createPostAction({ body: body.trim(), quoted_post_id: post.id })
      if ('error' in result && result.error) { setError(result.error); toastError(result.error); return }
      success('Quote posted')
      onClose()
    })
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--overlay-bg)', zIndex: 200 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)', width: 'min(560px, 95vw)',
        background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
        borderRadius: 20, padding: 20, zIndex: 201, animation: 'modalIn 0.18s ease',
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
          {post.body && <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5, wordBreak: 'break-word' }}>{post.body}</p>}
        </div>
        <textarea
          autoFocus value={body}
          onChange={e => { setBody(e.target.value); setError('') }}
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

// ── ActionBtn ─────────────────────────────────────────────────────────────────
function ActionBtn({ icon, count, active, activeColor, onClick, label, showZero = false, hidden = false }: {
  icon: React.ReactNode; count: number | null; active: boolean; activeColor: string
  onClick: (e: React.MouseEvent) => void; label: string; showZero?: boolean; hidden?: boolean
}) {
  if (hidden) return null
  return (
    <button
      onClick={onClick} aria-label={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        background: 'none', border: 'none', cursor: 'pointer',
        color: active ? activeColor : 'var(--color-text-muted)',
        padding: '6px 6px', borderRadius: 8, fontSize: 13,
        fontFamily: "'DM Sans',sans-serif", transition: 'color 0.12s, background 0.12s',
        WebkitTapHighlightColor: 'transparent',
        minWidth: 36, minHeight: 44, justifyContent: 'center',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-3)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
    >
      {icon}
      <span style={{ fontSize: 12, minWidth: 16 }}>
        {count !== null ? (count > 0 ? formatNumber(count) : showZero ? '0' : '') : ''}
      </span>
    </button>
  )
}

// ── PostActions — shared action bar used in both PostCard and RepostCard ──────
function PostActions({
  post,
  currentUserId,
  onReplyClick,
  onAnalyticsClick,
  analyticsOpen,
}: {
  post: FeedPost
  currentUserId?: string
  onReplyClick?: () => void
  onAnalyticsClick?: () => void
  analyticsOpen?: boolean
}) {
  const [, startTransition] = useTransition()
  const [liked, setLiked] = useState(post.is_liked)
  const [likeCount, setLikeCount] = useState(post.likes_count)
  const [disliked, setDisliked] = useState(post.is_disliked)
  const [dislikeCount, setDislikeCount] = useState(post.dislikes_count || 0)
  const [reposted, setReposted] = useState(post.is_reposted)
  const [repostCount, setRepostCount] = useState(post.reposts_count)
  const [bookmarked, setBookmarked] = useState(post.is_bookmarked)
  const [bookmarkCount, setBookmarkCount] = useState(post.bookmarks_count || 0)
  const [showRepostMenu, setShowRepostMenu] = useState(false)
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const repostRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { success, error: toastError } = useToast()

  useEffect(() => {
    if (!showRepostMenu) return
    const handler = (e: MouseEvent) => {
      if (repostRef.current && !repostRef.current.contains(e.target as Node)) setShowRepostMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showRepostMenu])

  function handleLike(e: React.MouseEvent) {
    e.stopPropagation()
    const nextLiked = !liked
    setLiked(nextLiked)
    setLikeCount(c => nextLiked ? c + 1 : Math.max(0, c - 1))
    if (disliked) { setDisliked(false); setDislikeCount(c => Math.max(0, c - 1)) }
    startTransition(async () => {
      const r = await toggleLikeAction(post.id)
      if ('error' in r) {
        setLiked(!nextLiked)
        setLikeCount(c => nextLiked ? Math.max(0, c - 1) : c + 1)
        if (disliked) { setDisliked(true); setDislikeCount(c => c + 1) }
        toastError('Could not update. Try again.')
      }
    })
  }

  function handleDislike(e: React.MouseEvent) {
    e.stopPropagation()
    const nextDisliked = !disliked
    setDisliked(nextDisliked)
    setDislikeCount(c => nextDisliked ? c + 1 : Math.max(0, c - 1))
    if (liked) { setLiked(false); setLikeCount(c => Math.max(0, c - 1)) }
    startTransition(async () => {
      const r = await toggleDislikeAction(post.id)
      if ('error' in r) {
        setDisliked(!nextDisliked)
        setDislikeCount(c => nextDisliked ? Math.max(0, c - 1) : c + 1)
        if (liked) { setLiked(true); setLikeCount(c => c + 1) }
        toastError('Could not update. Try again.')
      }
    })
  }

  function handleRepost(e: React.MouseEvent) {
    e.stopPropagation()
    const nextReposted = !reposted
    setShowRepostMenu(false)
    setReposted(nextReposted)
    setRepostCount(c => nextReposted ? c + 1 : Math.max(0, c - 1))
    startTransition(async () => {
      const r = await toggleRepostAction(post.id)
      if ('error' in r) {
        setReposted(!nextReposted)
        setRepostCount(c => nextReposted ? Math.max(0, c - 1) : c + 1)
        toastError('Could not repost. Try again.')
      } else {
        success(nextReposted ? 'Reposted' : 'Repost removed')
      }
    })
  }

  function handleBookmark(e: React.MouseEvent) {
    e.stopPropagation()
    const nextBookmarked = !bookmarked
    setBookmarked(nextBookmarked)
    setBookmarkCount(c => nextBookmarked ? c + 1 : Math.max(0, c - 1))
    startTransition(async () => {
      const r = await toggleBookmarkAction(post.id)
      if ('error' in r) {
        setBookmarked(!nextBookmarked)
        setBookmarkCount(c => nextBookmarked ? Math.max(0, c - 1) : c + 1)
        toastError('Could not save post. Try again.')
      } else {
        success(nextBookmarked ? 'Post saved' : 'Removed from saved')
      }
    })
  }

  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    const url = `${window.location.origin}/post/${post.id}`
    try {
      if (navigator.share) await navigator.share({ title: post.author?.display_name, text: post.body || '', url })
      else { await navigator.clipboard.writeText(url); success('Link copied to clipboard') }
    } catch { /* user dismissed share sheet */ }
  }

  function handleAnalytics(e: React.MouseEvent) {
    e.stopPropagation()
    void recordImpressionAction(post.id)
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, width: '100%', maxWidth: 480 }}>
        {/* Reply */}
        <ActionBtn
          icon={<MessageCircle size={18} />}
          count={post.comments_count}
          active={false} activeColor="#378ADD"
          onClick={e => {
            e.stopPropagation()
            if (onReplyClick) onReplyClick()
            else router.push(`/post/${post.id}`)
          }}
          label="Reply"
        />

        {/* Repost */}
        <div ref={repostRef} style={{ position: 'relative' }}>
          <ActionBtn
            icon={<Repeat2 size={18} />} count={repostCount}
            active={reposted} activeColor="var(--color-brand)"
            onClick={e => { e.stopPropagation(); setShowRepostMenu(v => !v) }}
            label="Repost"
          />
          {showRepostMenu && (
            <div
              onClick={e => e.stopPropagation()}
              style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, zIndex: 30, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 6, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}
            >
              <button onClick={handleRepost} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', color: reposted ? 'var(--color-brand)' : 'var(--color-text-primary)', fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}>
                <Repeat2 size={16} /> {reposted ? 'Undo repost' : 'Repost'}
              </button>
              <button onClick={e => { e.stopPropagation(); setShowRepostMenu(false); setShowQuoteModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'var(--color-text-primary)', fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}>
                <Quote size={16} /> Quote post
              </button>
            </div>
          )}
        </div>

        {/* Like */}
        <ActionBtn
          icon={<ThumbsUp size={18} fill={liked ? 'var(--color-brand)' : 'none'} />}
          count={likeCount} active={liked} activeColor="var(--color-brand)"
          onClick={handleLike} label="Like"
        />

        {/* Dislike */}
        <ActionBtn
          icon={<ThumbsDown size={18} fill={disliked ? 'var(--color-error)' : 'none'} />}
          count={dislikeCount} active={disliked} activeColor="var(--color-error)"
          onClick={handleDislike} label="Dislike"
        />

        {/* Analytics — only visible to post author */}
        {currentUserId && post.author?.id === currentUserId && (
          <ActionBtn
            icon={<BarChart2 size={18} />}
            count={post.impressions_count > 0 ? post.impressions_count : null}
            active={!!analyticsOpen} activeColor="var(--color-brand)"
            onClick={handleAnalytics} label="Analytics"
          />
        )}

        {/* Bookmark — hidden for now, preserved for later */}
        <div style={{ display: 'none' }}>
          <ActionBtn
            icon={<Bookmark size={18} fill={bookmarked ? 'var(--color-gold)' : 'none'} />}
            count={bookmarkCount} active={bookmarked} activeColor="var(--color-gold)"
            onClick={handleBookmark} label="Save"
          />
        </div>

        {/* Share */}
        <ActionBtn
          icon={<Share2 size={18} />} count={null}
          active={false} activeColor="var(--color-brand)"
          onClick={handleShare} label="Share"
        />
      </div>

      {showQuoteModal && <QuoteModal post={post} onClose={() => setShowQuoteModal(false)} />}
    </>
  )
}

// ── RepostCard ────────────────────────────────────────────────────────────────
function RepostCard({ post, currentUserId, onReplyClick, onAnalyticsClick }: { post: FeedPost; currentUserId?: string; onReplyClick?: () => void; onAnalyticsClick?: () => void }) {
  const router = useRouter()
  const original = post.quoted_post
  if (!original) return null

  // Build a FeedPost-compatible object for the original post so we can reuse PostActions
  const originalAsPost: FeedPost = {
    ...(original as any),
    is_liked: (original as any).is_liked ?? false,
    is_disliked: (original as any).is_disliked ?? false,
    is_reposted: (original as any).is_reposted ?? false,
    is_bookmarked: (original as any).is_bookmarked ?? false,
    impressions_count: (original as any).impressions_count ?? 0,
  }

  return (
    <article
      onClick={() => router.push(`/post/${original.id}`)}
      style={{
        borderBottom: '1px solid var(--color-border)',
        cursor: 'pointer',
        transition: 'background 0.12s',
        padding: '10px 16px 12px',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {/* Repost attribution row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingLeft: 26 }}>
        <div style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
          background: post.author.avatar_url ? 'transparent' : '#1A7A4A',
          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8, color: 'white', fontWeight: 800,
        }}>
          {post.author.avatar_url
            ? <img src={post.author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : post.author.display_name.slice(0, 1).toUpperCase()
          }
        </div>
        <Repeat2 size={13} color="var(--color-text-muted)" />
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontFamily: "'DM Sans',sans-serif" }}>
          <span
            onClick={e => { e.stopPropagation(); router.push(`/user/${post.author.username}`) }}
            style={{ color: 'var(--color-text-secondary)', fontWeight: 600, cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}
          >
            {post.author.display_name}
          </span>
          {' '}reposted
        </span>
      </div>

      {/* Original post content */}
      <div style={{ display: 'flex', gap: 12 }}>
        <Avatar name={original.author?.display_name || 'S'} avatarUrl={original.author?.avatar_url} username={original.author?.username} clickable size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 4 }}>
            <span
              onClick={e => { e.stopPropagation(); router.push(`/user/${original.author.username}`) }}
              style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif", cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
            >
              {original.author.display_name}
            </span>
            {original.author.verification_tier !== 'none' && (
              <span style={{ fontSize: 10, background: 'var(--color-brand)', color: 'white', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>✓</span>
            )}
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>@{original.author.username}</span>
            <span style={{ fontSize: 12, color: 'var(--color-border-light)' }}>·</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{formatRelativeTime(original.created_at)}</span>
          </div>
          {original.body && (
            <p style={{ fontSize: 15, color: 'var(--color-text-primary)', lineHeight: 1.6, wordBreak: 'break-word', whiteSpace: 'pre-wrap', marginBottom: original.media?.length ? 10 : 0 }}>
              {original.body}
            </p>
          )}
          <MediaRow media={original.media} />

          {/* Action bar on the original post inside repost */}
          <PostActions post={originalAsPost} currentUserId={currentUserId} onReplyClick={onReplyClick} onAnalyticsClick={onAnalyticsClick} />
        </div>
      </div>
    </article>
  )
}

// ── PostCard ──────────────────────────────────────────────────────────────────
export default function PostCard({
  post,
  currentUserId,
  onReplyClick,
  onAnalyticsClick,
  analyticsOpen,
}: {
  post: FeedPost
  currentUserId?: string
  onReplyClick?: () => void
  onAnalyticsClick?: () => void
  analyticsOpen?: boolean
}) {
  const [, startTransition] = useTransition()
  const [showMenu, setShowMenu] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const router = useRouter()
  const { success, error: toastError, info } = useToast()

  const isOwnPost = !!currentUserId && post.author?.id === currentUserId
  const isRepost = post.post_type === 'repost'

  if (deleted) return null
  if (isRepost) return <RepostCard post={post} currentUserId={currentUserId} onReplyClick={onReplyClick} onAnalyticsClick={onAnalyticsClick} />

  function navigate(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button,a,textarea,input,video')) return
    router.push(`/post/${post.id}`)
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setShowMenu(false)
    startTransition(async () => {
      const r = await deletePostAction(post.id)
      if ('error' in r) {
        toastError('Could not delete post. Try again.')
      } else {
        setDeleted(true)
        success('Post deleted')
      }
    })
  }

  const author = post.author

  return (
    <>
      <article
        onClick={navigate}
        style={{
          padding: '14px 16px', borderBottom: '1px solid var(--color-border)',
          display: 'flex', gap: 12,
          transition: 'background 0.12s',
          cursor: 'pointer',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-2)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <Avatar name={author?.display_name || 'S'} avatarUrl={author?.avatar_url} username={author?.username} clickable />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
              <span
                onClick={e => { e.stopPropagation(); author?.username && router.push(`/user/${author.username}`) }}
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
              <button
                onClick={e => { e.stopPropagation(); setShowMenu(v => !v) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '4px 6px', borderRadius: 6 }}
              >
                <MoreHorizontal size={16} />
              </button>
              {showMenu && (
                <>
                  <div onClick={e => { e.stopPropagation(); setShowMenu(false) }} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                  <div style={{ position: 'absolute', right: 0, top: 28, zIndex: 20, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 4, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                    {isOwnPost ? (
                      <button
                        onClick={handleDelete}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'var(--color-error)', fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}
                      >
                        <Trash2 size={15} /> Delete post
                      </button>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); setShowMenu(false); info('Report submitted. Thank you.') }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}
                      >
                        <Flag size={15} /> Report post
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Body */}
          {post.body && (
            <p style={{ fontSize: 15, color: 'var(--color-text-primary)', lineHeight: 1.6, marginBottom: (post.media?.length || post.quoted_post) ? 12 : 10, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
              {post.body}
            </p>
          )}

          {/* Quoted post embed */}
          {post.quoted_post && (
            <div
              onClick={e => { e.stopPropagation(); router.push(`/post/${post.quoted_post!.id}`) }}
              style={{ border: '1px solid var(--color-border)', borderRadius: 14, padding: '10px 12px', marginBottom: 10, cursor: 'pointer', background: 'var(--color-surface-2)', transition: 'background 0.12s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Avatar name={post.quoted_post.author?.display_name || 'S'} avatarUrl={post.quoted_post.author?.avatar_url} size={20} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif" }}>{post.quoted_post.author?.display_name}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>@{post.quoted_post.author?.username}</span>
              </div>
              {post.quoted_post.body && <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{post.quoted_post.body}</p>}
              {post.quoted_post.media && post.quoted_post.media.length > 0 && (
                <div style={{ marginTop: 6, borderRadius: 8, overflow: 'hidden', maxHeight: 160 }}>
                  <img src={post.quoted_post.media[0].url} alt="" style={{ width: '100%', objectFit: 'cover', maxHeight: 160 }} />
                </div>
              )}
            </div>
          )}

          {/* Media */}
          <MediaRow media={post.media} />

          {/* Action bar */}
          <PostActions post={post} currentUserId={currentUserId} onReplyClick={onReplyClick} onAnalyticsClick={onAnalyticsClick} analyticsOpen={analyticsOpen} />
        </div>
      </article>

      <style>{`@keyframes modalIn { from { opacity:0;transform:translateY(-10px) scale(0.98); } to { opacity:1;transform:none; } }`}</style>
    </>
  )
}