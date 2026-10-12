// src/components/feed/media-viewer.tsx
//
// Full-screen viewer for a post's photos and videos. A portal of its own (black
// screen, close button top-left, "..." top-right), not a dialog laid over the page.
//
//   Phone    MediaPortal (components/media/media-portal): the media, then the
//            action bar underneath - comment, repost, like, analytics - exactly
//            the buttons of the feed card. Like and repost work right here;
//            Comment opens a replies drawer over the media. "..." opens
//            Share via... / Save.
//   Desktop  Same black screen with the replies sidebar beside the media (as
//            before), plus the same "..." menu.
//
// The photo is already in the browser cache from the feed card, so the viewer
// shows that copy straight away (no spinner) and only then swaps in the 1600px
// version quietly in the background - skipped on a slow or offline connection.
'use client'

import VerifiedBadge from '@/components/ui/verified-badge'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  X, ChevronLeft, ChevronRight, MessageCircle,
  Repeat2, ThumbsUp, Ellipsis,
} from 'lucide-react'
import type { FeedPost } from '@/lib/actions/feed'
import { getPostRepliesAction } from '@/lib/actions/feed'
import { formatRelativeTime, formatNumber } from '@/lib/utils'
import ReplyComposer from '@/app/(main)/post/[id]/reply-composer'
import { PostActions } from '@/components/feed/post-card'
import { linkifyPostText } from '@/components/shared/linkify'
import { acquireFullscreenVideoFocus } from '@/lib/video-focus'
import { cloudinaryImage, fallbackToOriginal } from '@/lib/utils/cloudinary'
import { useNetworkStatus } from '@/lib/network-status'
import { useTranslation } from '@/lib/i18n/language-context'
import { useBackClose } from '@/hooks/use-back-close'
import MediaPortal from '@/components/media/media-portal'
import MediaOptionsDrawer, { MEDIA_DRAWER_BACKDROP } from '@/components/media/media-options-drawer'
import { BottomDrawer } from '@/components/ui/bottom-drawer'

interface MediaItem {
  id: string
  media_type: string
  url: string
  thumbnail_url: string | null
  width: number | null
  height: number | null
  position: number
}

interface MediaViewerProps {
  media: MediaItem[]
  initialIndex?: number
  post: FeedPost
  onClose: () => void
  /** Width (px) the feed card loaded this photo at - that exact URL is already cached, so it is shown first. */
  previewWidth?: number
  /** Playback position (s) of the inline copy of the opened video, to continue from. */
  initialVideoTime?: number
  /** Called when a video in the viewer goes away, with where the person stopped. */
  onVideoTime?: (index: number, time: number) => void
}

const AVATAR_COLORS = ['#1A7A4A','#7A3A1A','#1A4A7A','#4A1A7A','#7A6A1A','#1A6A6A']
function avatarBg(s: string) { return AVATAR_COLORS[s.charCodeAt(0) % AVATAR_COLORS.length] }

function SmallAvatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: url ? 'transparent' : avatarBg(name),
      overflow: 'hidden', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontWeight: 800,
      fontSize: size * 0.38, color: 'white',
      fontFamily: "'Syne', sans-serif",
    }}>
      {url
        ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : name.slice(0, 2).toUpperCase()
      }
    </div>
  )
}

// The full-screen player. Continues from where the inline copy was, and reports
// where the person stopped when it unmounts (closed, or swiped to another item)
// so the inline copy can pick up from there.
function ViewerVideo({ src, index, startTime, isMobile, onTime }: {
  src: string; index: number; startTime: number; isMobile: boolean
  onTime?: (index: number, time: number) => void
}) {
  const lastTime = useRef(startTime)
  const onTimeRef = useRef(onTime)
  onTimeRef.current = onTime

  useEffect(() => () => {
    if (lastTime.current > 0) onTimeRef.current?.(index, lastTime.current)
  }, [index])

  return (
    <video
      src={src} controls autoPlay
      onLoadedMetadata={e => {
        const v = e.currentTarget
        // Ignore a start point at/near the end (it had finished) - play from 0.
        if (startTime > 0 && startTime < v.duration - 0.5) v.currentTime = startTime
      }}
      onTimeUpdate={e => { lastTime.current = e.currentTarget.currentTime }}
      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: isMobile ? 0 : 10 }}
    />
  )
}

// Shows the copy the feed card already downloaded (same URL, so it comes from the
// browser cache - no loading state), then swaps to the sharper 1600px version once
// that has finished downloading off-screen. One <img>, so there is no overlay to
// line up and no layout shift: both versions have the same shape.
function ViewerImage({ url, previewWidth, isMobile }: { url: string; previewWidth: number; isMobile: boolean }) {
  const { isDegraded, isOffline } = useNetworkStatus()
  const preview = cloudinaryImage(url, previewWidth)
  const sharp = cloudinaryImage(url, 1600)
  const upgrade = sharp !== preview && !isDegraded && !isOffline
  const [src, setSrc] = useState(preview)

  useEffect(() => {
    setSrc(preview)
    if (!upgrade) return
    let cancelled = false
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => { if (!cancelled) setSrc(sharp) }
    img.src = sharp
    return () => { cancelled = true; img.onload = null }
  }, [preview, sharp, upgrade])

  return (
    <img
      src={src} alt="" decoding="async" onError={fallbackToOriginal(url)}
      draggable={false}
      style={{
        maxWidth: '100%',
        maxHeight: isMobile ? '100%' : 'calc(100vh - 96px)',
        objectFit: 'contain', borderRadius: isMobile ? 0 : 10,
        userSelect: 'none', display: 'block',
      }}
    />
  )
}

function ReplyCard({ reply }: { reply: FeedPost }) {
  const router = useRouter()
  const author = reply.author
  if (!author) return null
  return (
    <div
      onClick={() => router.push(`/post/${reply.id}`)}
      style={{
        display: 'flex', gap: 10, padding: '12px 16px',
        borderBottom: '1px solid var(--color-border)',
        cursor: 'pointer', transition: 'background 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <SmallAvatar name={author.display_name} url={author.avatar_url} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text-primary)' }}>
            {author.display_name}
          </span>
          {author.verification_tier && <VerifiedBadge tier={author.verification_tier} size={14} />}
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            @{author.username} · {formatRelativeTime(reply.created_at)}
          </span>
        </div>
        {reply.body?.trim() && (
          <p style={{ fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.5, margin: 0, wordBreak: 'break-word' }}>
            {linkifyPostText(reply.body)}
          </p>
        )}
        {reply.media && reply.media.length > 0 && (
          <img
            src={reply.media[0].thumbnail_url || reply.media[0].url}
            alt=""
            style={{ marginTop: 6, borderRadius: 8, maxHeight: 100, width: '100%', objectFit: 'cover' }}
          />
        )}
        <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
          {[
            { icon: <MessageCircle size={13} />, val: reply.comments_count },
            { icon: <Repeat2 size={13} />, val: reply.reposts_count },
            { icon: <ThumbsUp size={13} />, val: reply.likes_count },
          ].map(({ icon, val }, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--color-text-muted)' }}>
              {icon} {formatNumber(val)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function SidebarPanel({ post, replies, loading, onClose, onReplyPosted }: {
  post: FeedPost; replies: FeedPost[]; loading: boolean
  onClose: () => void; onReplyPosted: (r: FeedPost) => void
}) {
  const router = useRouter()
  const author = post.author

  return (
    <div className="mv-sidebar" style={{
      width: 400, flexShrink: 0,
      background: 'var(--color-surface)',
      borderLeft: '1px solid var(--color-border)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      animation: 'mvSlideIn 0.22s ease',
    }}>
      {/* Fixed top */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ padding: '16px 16px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            {author && (
              <>
                <SmallAvatar name={author.display_name} url={author.avatar_url} size={40} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif" }}>
                      {author.display_name}
                    </span>
                    {author.verification_tier && author.verification_tier !== 'none' && (
                      <VerifiedBadge tier={author.verification_tier} size={14} />
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>@{author.username}</span>
                </div>
              </>
            )}
          </div>
          {post.body?.trim() && (
            <p style={{ fontSize: 15, color: 'var(--color-text-primary)', lineHeight: 1.6, margin: '0 0 8px', wordBreak: 'break-word' }}>
              {linkifyPostText(post.body)}
            </p>
          )}
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {formatRelativeTime(post.created_at)}
          </span>
        </div>

        {/* Reuse PostActions — same buttons as the feed card */}
        <PostActions post={post} flush={false} />

        {/* The app's own reply composer: photos/videos, mentions, counter, and it posts in
            the background (progress line + toast) while you keep using the app. */}
        <div style={{ padding: '4px 16px 8px' }}>
          <ReplyComposer parentPostId={post.id} embedded onPosted={p => onReplyPosted(p as FeedPost)} />
        </div>
      </div>

      {/* Scrollable replies */}
      <div className="mv-sidebar" style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '28px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading replies...</span>
          </div>
        ) : replies.length === 0 ? (
          <div style={{ padding: '36px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>No replies yet</p>
            <p style={{ fontSize: 13, color: 'var(--color-text-faint)', marginTop: 4 }}>Be the first</p>
          </div>
        ) : (
          replies.map(r => <ReplyCard key={r.id} reply={r} />)
        )}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={() => { onClose(); router.push(`/post/${post.id}`) }}
            style={{
              width: '100%', padding: '9px', borderRadius: 10,
              border: '1px solid var(--color-border)',
              background: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: 'var(--color-brand)',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-brand-muted, #0a2016)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            View full post & replies
          </button>
        </div>
      </div>
    </div>
  )
}

// Phone: the replies sheet that slides up over the media (Comment button).
function CommentsDrawer({ open, onClose, post, replies, loading, onReplyPosted, onViewAll, onHeight }: {
  open: boolean; onClose: () => void
  post: FeedPost; replies: FeedPost[]; loading: boolean
  onReplyPosted: (r: FeedPost) => void; onViewAll: () => void
  onHeight?: (px: number) => void
}) {
  const { t } = useTranslation()
  // Shorter than before and with no shade: the picture moves up to sit above the
  // drawer (see MediaPortal's bottomInset) and stays fully visible while you read.
  return (
    <BottomDrawer
      open={open} onClose={onClose} title={t('media.replies_title')}
      height="58dvh" backdrop="transparent" onHeight={onHeight} avoidKeyboard
    >
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', margin: '0 -12px' }}>
        {loading ? (
          <div style={{ padding: '28px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading replies...</span>
          </div>
        ) : replies.length === 0 ? (
          <div style={{ padding: '36px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>No replies yet</p>
            <p style={{ fontSize: 13, color: 'var(--color-text-faint)', marginTop: 4 }}>Be the first</p>
          </div>
        ) : (
          replies.map(r => <ReplyCard key={r.id} reply={r} />)
        )}
        <div style={{ padding: '12px 16px' }}>
          <button
            onClick={onViewAll}
            style={{
              width: '100%', padding: '9px', borderRadius: 10,
              border: '1px solid var(--color-border)', background: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: 'var(--color-brand)',
            }}
          >
            View full post &amp; replies
          </button>
        </div>
      </div>
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--color-border)', padding: '4px 4px 0' }}>
        <ReplyComposer parentPostId={post.id} embedded onPosted={p => onReplyPosted(p as FeedPost)} />
      </div>
    </BottomDrawer>
  )
}

export default function MediaViewer({ media, initialIndex = 0, post, onClose, previewWidth = 900, initialVideoTime = 0, onVideoTime }: MediaViewerProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [idx,      setIdx]     = useState(initialIndex)
  const [replies,  setReplies] = useState<FeedPost[]>([])
  const [loading,  setLoading] = useState(true)
  // Only ever rendered after a tap (never on the server), so window is safe to read here.
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  // Portaled to document.body below - see the note on ConfirmModal for why.
  const [mounted,  setMounted]  = useState(false)
  const [menuOpen,     setMenuOpen]     = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  // Heights of whichever bottom drawer is open; the picture moves up to clear it.
  const [menuH, setMenuH] = useState(0)
  const [commentsH, setCommentsH] = useState(0)
  const [repostH, setRepostH] = useState(0)   // the Repost options drawer lives in PostActions
  const repliesLoadedFor = useRef<string | null>(null)
  // Phone: swipe between photos (the arrow buttons are desktop-only).
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => setMounted(true), [])
  // The desktop layout is a plain portal below; on a phone MediaPortal registers itself.
  useBackClose(!isMobile, onClose)

  // While this is open, every inline feed video is paused and stays paused (see
  // lib/video-focus). Registered for the viewer's whole lifetime, independent of
  // whether the current item is a video - inline videos shouldn't run under an
  // image either.
  useEffect(() => acquireFullscreenVideoFocus(), [])

  // The inline start position belongs to the item that was clicked, and only the
  // first time it's shown - not if the person swipes away and back.
  const leftInitialItem = useRef(false)
  useEffect(() => { if (idx !== initialIndex) leftInitialItem.current = true }, [idx, initialIndex])
  const startTime = idx === initialIndex && !leftInitialItem.current ? initialVideoTime : 0

  const current = media[idx]
  const hasPrev = idx > 0
  const hasNext = idx < media.length - 1

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Replies: the desktop sidebar shows them straight away; on a phone they are
  // fetched the first time the replies drawer is opened (most views never open it).
  const wantReplies = !isMobile || commentsOpen
  useEffect(() => {
    if (!wantReplies || repliesLoadedFor.current === post.id) return
    repliesLoadedFor.current = post.id
    setLoading(true)
    getPostRepliesAction(post.id)
      .then(({ posts }) => setReplies(posts))
      .catch(() => { repliesLoadedFor.current = null })
      .finally(() => setLoading(false))
  }, [wantReplies, post.id])

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !isMobile)      onClose()
    if (e.key === 'ArrowLeft'  && hasPrev)    setIdx(i => i - 1)
    if (e.key === 'ArrowRight' && hasNext)    setIdx(i => i + 1)
  }, [hasPrev, hasNext, onClose, isMobile])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [handleKey])

  if (!current || !mounted) return null

  const isVideo = current.media_type === 'video'
  const shareLink = typeof window !== 'undefined' ? `${window.location.origin}/post/${post.id}` : undefined

  const navBtnStyle: React.CSSProperties = {
    position: 'absolute', zIndex: 10,
    width: 42, height: 42, borderRadius: '50%',
    background: 'rgba(0,0,0,0.6)', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: 'white',
    backdropFilter: 'blur(4px)', transition: 'background 0.15s',
  }

  // The media itself with its previous/next buttons and position dots. Identical
  // on both layouts; only the space around it differs.
  const stage = (
    <>
      {!isMobile && hasPrev && (
        <button onClick={() => setIdx(i => i - 1)} className="mv-nav-btn" aria-label="Previous"
          style={{ ...navBtnStyle, left: 16, top: '50%', transform: 'translateY(-50%)' }}>
          <ChevronLeft size={22} />
        </button>
      )}

      {!isMobile && hasNext && (
        <button onClick={() => setIdx(i => i + 1)} className="mv-nav-btn" aria-label="Next"
          style={{ ...navBtnStyle, right: 16, top: '50%', transform: 'translateY(-50%)' }}>
          <ChevronRight size={22} />
        </button>
      )}

      <div
        key={current.id}
        // Pointer events, not touch events: they fire for a finger, a mouse drag and a
        // browser's phone simulation alike. touch-action: pan-y (below) tells the browser
        // to leave horizontal gestures to us, so a finger swipe isn't cancelled as a scroll.
        onPointerDown={isMobile ? e => {
          // A drag on a video's seek bar / volume is not a swipe.
          if (!e.isPrimary || e.button !== 0 || (e.target as HTMLElement).closest('video')) { swipeStart.current = null; return }
          swipeStart.current = { x: e.clientX, y: e.clientY }
        } : undefined}
        onPointerCancel={isMobile ? () => { swipeStart.current = null } : undefined}
        onPointerUp={isMobile ? e => {
          const s = swipeStart.current
          swipeStart.current = null
          if (!s) return
          const dx = e.clientX - s.x
          const dy = e.clientY - s.y
          // Clearly horizontal and long enough; otherwise it was a tap or a scroll.
          if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
          if (dx < 0 && hasNext) setIdx(i => i + 1)
          else if (dx > 0 && hasPrev) setIdx(i => i - 1)
        } : undefined}
        style={{
        touchAction: isMobile ? 'pan-y' : undefined,
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: isMobile ? 0 : '48px 56px',
        boxSizing: 'border-box',
        animation: 'mvFadeIn 0.15s ease',
      }}>
        {isVideo ? (
          <ViewerVideo
            src={current.url} index={idx} startTime={startTime}
            isMobile={isMobile} onTime={onVideoTime}
          />
        ) : (
          <ViewerImage url={current.url} previewWidth={previewWidth} isMobile={isMobile} />
        )}
      </div>

      {media.length > 1 && (
        <div style={{ position: 'absolute', bottom: isMobile ? 6 : 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
          {media.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} aria-label={`${i + 1} / ${media.length}`} style={{
              width: i === idx ? 18 : 6, height: 6, borderRadius: 3, border: 'none',
              background: i === idx ? 'white' : 'rgba(255,255,255,0.35)',
              cursor: 'pointer', padding: 0, transition: 'width 0.2s, background 0.2s',
            }} />
          ))}
        </div>
      )}
    </>
  )

  const optionsDrawer = (
    <MediaOptionsDrawer
      open={menuOpen} onClose={() => setMenuOpen(false)}
      url={current.url} kind={isVideo ? 'video' : 'image'}
      shareTitle={post.author?.display_name} shareLink={shareLink}
      onHeight={setMenuH}
    />
  )

  const styles = (
    <style>{`
      @keyframes mvFadeIn  { from { opacity:0 } to { opacity:1 } }
      @keyframes mvSlideIn { from { transform:translateX(40px);opacity:0 } to { transform:translateX(0);opacity:1 } }
      .mv-sidebar::-webkit-scrollbar { width: 4px; }
      .mv-sidebar::-webkit-scrollbar-track { background: transparent; }
      .mv-sidebar::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 2px; }
      .mv-nav-btn:hover { background: rgba(0,0,0,0.85) !important; }
    `}</style>
  )

  // -- Phone: black portal, media, action bar underneath ------------------------
  if (isMobile) {
    return (
      <>
        {styles}
        <MediaPortal
          label={isVideo ? t('notif.video') : t('notif.photo')}
          onClose={onClose}
          onMenu={() => setMenuOpen(true)}
          bottomInset={Math.max(menuH, commentsH, repostH)}
          footer={
            <PostActions
              post={post} tone="onDark" flush={false} align="center"
              drawerBackdrop={MEDIA_DRAWER_BACKDROP} onDrawerHeight={setRepostH}
              onReplyClick={() => setCommentsOpen(true)}
            />
          }
        >
          {stage}
        </MediaPortal>
        {optionsDrawer}
        <CommentsDrawer
          open={commentsOpen} onClose={() => setCommentsOpen(false)}
          post={post} replies={replies} loading={loading}
          onReplyPosted={r => setReplies(prev => [r, ...prev])}
          onViewAll={() => { setCommentsOpen(false); onClose(); router.push(`/post/${post.id}`) }}
          onHeight={setCommentsH}
        />
      </>
    )
  }

  // -- Desktop: media on the left, replies sidebar on the right -----------------
  return createPortal(
    <>
      {/* Portaled to document.body - globals.css's `body > * { z-index: 1 }`
          otherwise traps this full-screen viewer under the mobile bottom
          nav regardless of its own z-index (300). See ConfirmModal for the
          full explanation. */}
      {styles}

      <div
        onClick={e => {
          // React events bubble through portals, and this viewer is rendered inside
          // the post card's clickable <article>. Without this, clicking the
          // backdrop (or anywhere non-interactive in the viewer) would also
          // trigger the card's "open post" navigation.
          e.stopPropagation()
          if (e.target === e.currentTarget) onClose()
        }}
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'var(--viewer-bg)',
          display: 'flex',
          animation: 'mvFadeIn 0.18s ease',
        }}
      >
        {/* Media panel */}
        <div style={{
          flex: 1, position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 0, overflow: 'hidden',
        }}>
          <button onClick={onClose} className="mv-nav-btn" aria-label={t('chat.close')} style={{ ...navBtnStyle, top: 16, left: 16 }}>
            <X size={18} />
          </button>
          <button onClick={() => setMenuOpen(true)} className="mv-nav-btn" aria-label={t('media.options')} style={{ ...navBtnStyle, top: 16, right: 16 }}>
            <Ellipsis size={18} />
          </button>

          {stage}
        </div>

        <SidebarPanel
          post={post} replies={replies} loading={loading}
          onClose={onClose}
          onReplyPosted={r => setReplies(prev => [r, ...prev])}
        />
      </div>
      {optionsDrawer}
    </>,
    document.body
  )
}