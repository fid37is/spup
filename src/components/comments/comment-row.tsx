'use client'

// src/components/comments/comment-row.tsx
//
// One comment, shown exactly the way it's shown on its own page as the
// focused post - because on Spup, as on Threads, every post and every reply
// use the same page template (src/app/(main)/post/[id]/page.tsx). There is
// no separate "nested reply" look: tapping a comment (or its reply count)
// takes you to that comment's own page, where its own replies are just more
// rows exactly like this one. That recursion is what replaces indentation.

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Heart, MessageCircle, Repeat2, Send, MoreHorizontal, Link2, Flag, Trash2 } from 'lucide-react'
import {
  toggleLikeAction, toggleRepostAction, deletePostAction, recordImpressionAction,
  recordProfileVisitFromPostAction,
} from '@/lib/actions'
import { formatRelativeTime, formatNumber } from '@/lib/utils'
import { cloudinaryImage, fallbackToOriginal } from '@/lib/utils/cloudinary'
import { linkifyPostText } from '@/components/shared/linkify'
import { GatedMedia } from '@/components/media/media-gate'
import MediaViewer from '@/components/feed/media-viewer'
import ConfirmModal from '@/components/ui/confirm-modal'
import { useToast } from '@/components/layout/toast'

export interface CommentData {
  id: string
  body: string | null
  created_at: string
  likes_count: number
  comments_count: number
  reposts_count: number
  is_liked?: boolean
  is_reposted?: boolean
  author: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
    verification_tier?: string | null
  }
  media?: Array<{
    id: string; media_type: string; url: string; thumbnail_url?: string | null
    width?: number | null; height?: number | null; position: number
  }>
}

interface Props {
  post: CommentData
  isPostAuthor: boolean
  currentUserId?: string
  isNew?: boolean
  onDeleted: (id: string) => void
}

const AVATAR_COLORS = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A1A4A', '#4A7A1A']

function Avatar({ name, url, onClick }: { name: string; url: string | null; onClick: (e: React.MouseEvent) => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', cursor: 'pointer',
        background: url ? 'transparent' : AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length],
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 13, color: 'white',
      }}
    >
      {url
        ? <img src={cloudinaryImage(url, 96)} alt={name} loading="lazy" decoding="async"
            onError={fallbackToOriginal(url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : name.slice(0, 2).toUpperCase()}
    </div>
  )
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.03em', padding: '1px 6px', borderRadius: 6,
      color, border: `1px solid ${color}`, lineHeight: 1.5, flexShrink: 0,
    }}>{children}</span>
  )
}

function ActionButton({ icon, count, active, activeColor, label, onClick }: {
  icon: React.ReactNode; count?: number; active?: boolean; activeColor?: string; label: string; onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(e) }}
      aria-label={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
        cursor: 'pointer', padding: '8px 10px 8px 0', marginRight: 6, minHeight: 36,
        color: active ? activeColor : 'var(--color-text-muted)', fontSize: 12.5,
        fontFamily: "'DM Sans', sans-serif", WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
      }}
    >
      {icon}
      {count !== undefined && count > 0 && <span>{formatNumber(count)}</span>}
    </button>
  )
}

export default function CommentRow({ post, isPostAuthor, currentUserId, isNew, onDeleted }: Props) {
  const router = useRouter()
  const { success, error: toastError, info } = useToast()
  const [, startTransition] = useTransition()
  const isOwn = !!currentUserId && post.author.id === currentUserId

  const [liked, setLiked] = useState(!!post.is_liked)
  const [likeCount, setLikeCount] = useState(post.likes_count)
  const [reposted, setReposted] = useState(!!post.is_reposted)
  const [repostCount, setRepostCount] = useState(post.reposts_count)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [viewerIdx, setViewerIdx] = useState<number | null>(null)

  const rowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (isOwn) return
    const el = rowRef.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        timer = setTimeout(() => { void recordImpressionAction(post.id); io.disconnect() }, 1000)
      } else if (timer) { clearTimeout(timer); timer = null }
    }, { threshold: 0.5 })
    io.observe(el)
    return () => { io.disconnect(); if (timer) clearTimeout(timer) }
  }, [post.id, isOwn])

  // Tapping the row opens THIS comment's own page - same as tapping a post
  // anywhere else in the app. Interactive elements inside the row (buttons,
  // the avatar/name, media) opt out so their own click handlers still work.
  function openThread(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('button, a, img, video, [data-no-nav]')) return
    router.push(`/post/${post.id}`)
  }

  // Used by the Reply action button itself, which is INSIDE the row's own
  // data-no-nav actions area (so a tap on Like/Repost/Share doesn't also
  // navigate) - openThread()'s own guard would reject a click that
  // originated from within that area, including this button, so it needs
  // its own unguarded handler instead of reusing openThread directly.
  function goToThread() {
    router.push(`/post/${post.id}`)
  }

  function goToProfile(e: React.MouseEvent) {
    e.stopPropagation()
    void recordProfileVisitFromPostAction(post.id)
    router.push(`/user/${post.author.username}`)
  }

  function handleLike(e: React.MouseEvent) {
    const next = !liked
    setLiked(next)
    setLikeCount(c => (next ? c + 1 : Math.max(0, c - 1)))
    startTransition(async () => {
      const r = await toggleLikeAction(post.id)
      if ('error' in r) {
        setLiked(!next); setLikeCount(c => (next ? Math.max(0, c - 1) : c + 1))
        toastError('Could not update. Try again.')
      }
    })
  }

  function handleRepost(e: React.MouseEvent) {
    const next = !reposted
    setReposted(next)
    setRepostCount(c => (next ? c + 1 : Math.max(0, c - 1)))
    startTransition(async () => {
      const r = await toggleRepostAction(post.id)
      if ('error' in r) {
        setReposted(!next); setRepostCount(c => (next ? Math.max(0, c - 1) : c + 1))
        toastError('Could not repost. Try again.')
      } else success(next ? 'Reposted' : 'Repost removed')
    })
  }

  async function handleShare() {
    const url = `${window.location.origin}/post/${post.id}`
    try {
      if (navigator.share) await navigator.share({ title: post.author.display_name, text: post.body || '', url })
      else { await navigator.clipboard.writeText(url); success('Link copied') }
    } catch { /* dismissed */ }
  }

  function copyLink() {
    setMenuOpen(false)
    navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`)
      .then(() => success('Link copied'))
      .catch(() => toastError('Could not copy link.'))
  }

  function confirmDeleteNow() {
    setDeleting(true)
    startTransition(async () => {
      const r = await deletePostAction(post.id)
      setDeleting(false)
      setConfirmDelete(false)
      if ('error' in r) { toastError(r.error || 'Could not delete. Try again.'); return }
      onDeleted(post.id)
      success('Deleted')
    })
  }

  const media = [...(post.media ?? [])].sort((a, b) => a.position - b.position)

  return (
    <div
      ref={rowRef}
      onClick={openThread}
      role="button"
      className={isNew ? 'comment-new' : undefined}
      style={{ display: 'flex', gap: 12, minWidth: 0, padding: '12px 16px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
    >
      <Avatar name={post.author.display_name || post.author.username} url={post.author.avatar_url} onClick={goToProfile} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0, rowGap: 2 }}>
            <span
              onClick={goToProfile}
              style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif", cursor: 'pointer' }}
            >
              {post.author.display_name || post.author.username}
            </span>
            {post.author.verification_tier && post.author.verification_tier !== 'none' && (
              <span style={{ fontSize: 9, background: 'var(--color-brand)', color: 'white', padding: '1px 4px', borderRadius: 4, fontWeight: 700 }}>✓</span>
            )}
            {isPostAuthor && <Tag color="var(--color-brand)">Author</Tag>}
            {isOwn && <Tag color="var(--color-text-secondary)">You</Tag>}
            <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{formatRelativeTime(post.created_at)}</span>
          </div>

          <div style={{ position: 'relative', flexShrink: 0 }} data-no-nav>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
              aria-label="More"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '4px 2px', display: 'flex' }}
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <>
                <div onClick={e => { e.stopPropagation(); setMenuOpen(false) }} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
                <div style={{
                  position: 'absolute', right: 0, top: '100%', zIndex: 61, minWidth: 170, padding: 6,
                  background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
                  borderRadius: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                }}>
                  {[
                    { label: 'Copy link', icon: <Link2 size={15} />, onClick: copyLink, color: 'var(--color-text-primary)', show: true },
                    { label: 'Delete', icon: <Trash2 size={15} />, onClick: () => { setMenuOpen(false); setConfirmDelete(true) }, color: 'var(--color-error)', show: isOwn },
                    { label: 'Report', icon: <Flag size={15} />, onClick: () => { setMenuOpen(false); info('Report submitted. Thank you.') }, color: 'var(--color-text-secondary)', show: !isOwn },
                  ].filter(i => i.show).map(i => (
                    <button key={i.label} onClick={i.onClick} style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px',
                      background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer',
                      color: i.color, fontSize: 14, fontFamily: "'DM Sans', sans-serif",
                    }}>{i.icon}{i.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {post.body?.trim() && (
          <p style={{
            margin: '2px 0 0', fontSize: 15, lineHeight: 1.5, color: 'var(--color-text-primary)',
            wordBreak: 'break-word', whiteSpace: 'pre-wrap',
          }}>
            {linkifyPostText(post.body)}
          </p>
        )}

        {media.length > 0 && (
          <div
            className="comment-media"
            data-no-nav
            style={{ display: 'flex', gap: 6, marginTop: 8, overflowX: media.length > 1 ? 'auto' : 'hidden', borderRadius: 12 }}
          >
            {media.map((m, i) => (
              <div
                key={m.id || i}
                onClick={e => { e.stopPropagation(); if (m.media_type === 'image') setViewerIdx(i) }}
                style={{
                  flex: media.length > 1 ? '0 0 150px' : '0 1 auto', maxWidth: '100%',
                  borderRadius: 12, overflow: 'hidden', background: 'var(--color-surface-2)',
                  cursor: m.media_type === 'image' ? 'pointer' : 'default',
                }}
              >
                {m.media_type === 'image' ? (
                  <GatedMedia render={() => (
                    <img
                      src={cloudinaryImage(m.url, 560)} alt="" loading="lazy" decoding="async" onError={fallbackToOriginal(m.url)}
                      style={media.length > 1
                        ? { width: 150, height: 150, objectFit: 'cover', display: 'block' }
                        : { maxWidth: '100%', maxHeight: 260, display: 'block' }}
                    />
                  )} />
                ) : (
                  <GatedMedia render={() => (
                    <video src={m.url} controls playsInline preload="metadata"
                      style={{ maxWidth: '100%', maxHeight: 300, display: 'block', background: '#000' }} />
                  )} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* actions */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 2, marginLeft: -2 }} data-no-nav>
          <ActionButton
            icon={<Heart size={17} fill={liked ? 'var(--color-brand)' : 'none'} />}
            count={likeCount} active={liked} activeColor="var(--color-brand)" label="Like" onClick={handleLike}
          />
          {/* Reply count only - tapping it (or anywhere on the row) opens this
              comment's own page, where its replies live and where the reply
              composer at the bottom targets IT. */}
          <ActionButton icon={<MessageCircle size={17} />} count={post.comments_count} label="Reply" onClick={goToThread} />
          <ActionButton
            icon={<Repeat2 size={18} />} count={repostCount} active={reposted} activeColor="var(--color-brand)"
            label="Repost" onClick={handleRepost}
          />
          <ActionButton icon={<Send size={16} />} label="Share" onClick={handleShare} />
        </div>
      </div>

      {viewerIdx !== null && (
        <MediaViewer
          media={media.filter(m => m.media_type === 'image') as any}
          initialIndex={Math.max(0, media.filter(m => m.media_type === 'image').findIndex(m => m.id === media[viewerIdx]?.id))}
          post={post as any}
          onClose={() => setViewerIdx(null)}
        />
      )}

      <div data-no-nav>
        <ConfirmModal
          open={confirmDelete}
          title="Delete comment?"
          description="This can't be undone."
          confirmLabel="Delete"
          confirmingLabel="Deleting…"
          destructive
          pending={deleting}
          onConfirm={confirmDeleteNow}
          onCancel={() => setConfirmDelete(false)}
        />
      </div>
    </div>
  )
}
