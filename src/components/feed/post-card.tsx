// src/components/feed/post-card.tsx
'use client'

import { useState, useTransition, useEffect, useRef, useId } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import {
  MessageCircle, Repeat2, Heart, Send, BarChart2,
  Bookmark, MoreHorizontal, Trash2, Quote, Flag, Pin, PinOff, Megaphone, Link2, Tag,
  Play, Volume2, VolumeX, X, ChevronDown, Globe,
} from 'lucide-react'
import PromoteModal from './promote-modal'
import ReportDialog from './report-dialog'
import DraftsPanel from './drafts-panel'
import {
  toggleLikeAction,
  toggleRepostAction,
  toggleBookmarkAction,
  deletePostAction,
  createPostAction,
  recordImpressionAction,
  recordLinkClickAction,
  recordDetailExpandAction,
  recordProfileVisitFromPostAction,
  togglePinPostAction,
  checkHasPinnedPostAction,
  getViewerIdentityAction,
  recordPromotionImpressionAction,
  recordPromotionClickAction,
} from '@/lib/actions'
import { showSupportResources } from '@/lib/support-resources'
import { formatRelativeTime, formatNumber } from '@/lib/utils'
import { shouldAutoplay } from '@/lib/autoplay'
import { trackVideoProgress } from '@/lib/video-analytics'
import { useEngagementOverride, beginEngagement, endEngagement, settleEngagement } from '@/lib/engagement-state'
import {
  isInlineVideoSuspended, useInlineVideoSuspended,
  claimInlineAudio, releaseInlineAudio, useInlineAudioOwner,
} from '@/lib/video-focus'
import type { FeedPost } from '@/lib/actions/feed'
import { useToast } from '@/components/layout/toast'
import MediaViewer from '@/components/feed/media-viewer'
import { cloudinaryImage, fallbackToOriginal, videoPoster } from '@/lib/utils/cloudinary'
import PayVendorButton from '@/components/escrow/pay-vendor-button'
import { GatedMedia } from '@/components/media/media-gate'
import { ProgressiveImage } from '@/components/media/progressive-image'
import { publishFeedEvent } from '@/lib/feed-local-events'
import { linkifyPostText, closeCutBold } from '@/components/shared/linkify'
import LinkPreviewCard from '@/components/feed/link-preview-card'
import ConfirmModal from '@/components/ui/confirm-modal'
import VerifiedBadge from '@/components/ui/verified-badge'
import { useTranslation } from '@/lib/i18n/language-context'

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({
  name, avatarUrl, size = 42, username, clickable = false, postId, isOwn = false,
}: {
  name: string
  avatarUrl?: string | null
  size?: number
  username?: string
  clickable?: boolean
  postId?: string
  /** The author is the signed-in user: go to /profile and don't count a visit. */
  isOwn?: boolean
}) {
  const router = useRouter()
  const colors = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A1A4A', '#4A7A1A']
  const color = colors[name.charCodeAt(0) % colors.length]
  return (
    <div
      onClick={
        clickable && username
          ? e => {
            e.stopPropagation()
            if (isOwn) { router.push('/profile'); return }
            if (postId) void recordProfileVisitFromPostAction(postId)
            router.push(`/user/${username}`)
          }
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
        ? <img src={cloudinaryImage(avatarUrl, 128)} alt={name} loading="lazy" decoding="async" onError={fallbackToOriginal(avatarUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : name.slice(0, 2).toUpperCase()
      }
    </div>
  )
}

// ── MediaRow ──────────────────────────────────────────────────────────────────
// `registry` + `index` let the parent MediaRow find this element, so that opening
// the full-screen viewer can hand over the current playback position (and take it
// back on close) instead of restarting the video from 0.
function TrackedVideo({ src, poster, postId, width, height, registry, index }: {
  src: string; poster?: string; postId: string; width?: number | null; height?: number | null
  registry?: Map<number, HTMLVideoElement>; index?: number
}) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [muted, setMuted] = useState(true)
  const [playing, setPlaying] = useState(false)

  const audioId = useId()
  const audioOwner = useInlineAudioOwner()
  // Full-screen viewer open somewhere => this inline copy must stay quiet.
  const suspended = useInlineVideoSuspended()
  const inViewRef = useRef(false)        // >= 50% on screen right now
  const resumeRef = useRef(false)        // should be playing once the viewer closes

  // Register with the parent row (for playback-position handoff).
  useEffect(() => {
    const video = videoRef.current
    if (!video || !registry || index === undefined) return
    registry.set(index, video)
    return () => { if (registry.get(index) === video) registry.delete(index) }
  }, [registry, index])

  // Only one inline video gets sound: if another one took audio focus, mute this.
  useEffect(() => {
    if (audioOwner !== audioId) setMuted(true)
  }, [audioOwner, audioId])
  useEffect(() => () => releaseInlineAudio(audioId), [audioId])

  // Full-screen viewer opened -> pause (remembering whether we were playing);
  // closed -> pick back up if we were and are still on screen.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (suspended) {
      if (!video.paused) resumeRef.current = true
      video.pause()
    } else if (resumeRef.current) {
      resumeRef.current = false
      if (inViewRef.current) video.play().catch(() => { })
    }
  }, [suspended])

  useEffect(() => {
    const video = videoRef.current
    const container = containerRef.current
    if (!video || !container) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const inView = entry.isIntersecting && entry.intersectionRatio >= 0.5
        inViewRef.current = inView

        // A full-screen viewer is open: never start playback underneath it.
        // (If it's scrolled out of view meanwhile, don't resume it on close.)
        if (isInlineVideoSuspended()) {
          if (!inView) resumeRef.current = false
          return
        }

        if (!inView) {
          // Always pause once scrolled away, even if the person started it
          // manually (autoplay off) - otherwise it keeps playing off-screen.
          video.pause()
          return
        }
        // Read the setting each time (not once at mount) so a change in
        // Settings and a switch from Wi-Fi to mobile data both take effect.
        // When it says no, leave the video alone - the play button is there.
        if (shouldAutoplay()) video.play().catch(() => { })
      },
      { threshold: [0, 0.5, 1] }
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  function togglePlay(e: React.MouseEvent) {
    e.stopPropagation()
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => { })
    else video.pause()
  }

  function handleTimeUpdate(e: React.SyntheticEvent<HTMLVideoElement>) {
    const v = e.currentTarget
    trackVideoProgress(postId, src, v.currentTime, v.duration)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <video
        ref={videoRef}
        src={src} poster={poster} playsInline loop muted={muted} preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        style={{
          width: '100%', height: '100%',
          objectFit: width && height ? 'contain' : 'cover',
          background: '#000',
        }}
      />

      {/* Manual play/pause - needed when autoplay is off, or to resume after scroll-pause */}
      {!playing && (
        <button
          onClick={togglePlay}
          aria-label={t('post.play')}
          style={{
            position: 'absolute', inset: 0, margin: 'auto', width: 52, height: 52,
            borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none',
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Play size={22} fill="white" />
        </button>
      )}

      <button
        onClick={e => {
          e.stopPropagation()
          if (muted) { setMuted(false); claimInlineAudio(audioId) }
          else { setMuted(true); releaseInlineAudio(audioId) }
        }}
        aria-label={muted ? t('post.unmute') : t('post.mute')}
        style={{
          position: 'absolute', bottom: 10, right: 10,
          width: 32, height: 32, borderRadius: '50%',
          background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
    </div>
  )
}

// `bleed` (quoted-post embed): a single item runs edge to edge across the embed,
// centred, with no rounding of its own (the embed's border clips the corners).
function MediaRow({ media, postId, post, compact = false, bleed = false }: { media: FeedPost['media']; postId: string; post: FeedPost; compact?: boolean; bleed?: boolean }) {
  const [viewerIdx, setViewerIdx] = useState<number | null>(null)
  // Where the inline copy of the video was when the viewer opened, so the
  // full-screen player continues from there rather than restarting.
  const [viewerStartTime, setViewerStartTime] = useState(0)
  const inlineVideos = useRef(new Map<number, HTMLVideoElement>())
  const scrollerRef = useRef<HTMLDivElement>(null)
  const cap = bleed ? 340 : compact ? 260 : 520
  const radius = bleed ? 0 : compact ? 8 : 14

  if (!media || media.length === 0) return null
  const sorted = [...media].sort((a, b) => a.position - b.position)

  function openViewer(i: number, e: React.MouseEvent) {
    e.stopPropagation()
    setViewerStartTime(inlineVideos.current.get(i)?.currentTime ?? 0)
    setViewerIdx(i)
  }

  // The viewer's video just went away (closed, or swiped to another item):
  // move the inline copy to where the person stopped watching.
  function syncInlineVideoTime(i: number, time: number) {
    const el = inlineVideos.current.get(i)
    if (!el || !Number.isFinite(time)) return
    const finished = el.duration > 0 && time >= el.duration - 0.25
    el.currentTime = finished ? 0 : time
  }

  // Single item - width is derived from the media's real aspect ratio against
  // the height cap, not forced to 100%. A portrait item renders at its own
  // narrower width (capped by height, flush left - never stretched or
  // centered); a landscape item naturally fills the column.
  if (sorted.length === 1) {
    const m = sorted[0]
    const ratio = m.width && m.height ? m.width / m.height : null
    const boxWidth = ratio ? `min(100%, ${Math.round(ratio * cap)}px)` : undefined
    const bleedWrap: React.CSSProperties = bleed
      ? { display: 'flex', justifyContent: 'center', width: '100%', background: 'var(--color-surface-2)' }
      : { display: 'contents' }
    return (
      <>
        <div style={bleedWrap}>
        <div
          onClick={compact ? undefined : (e => openViewer(0, e))}
          style={{
            borderRadius: radius, overflow: 'hidden', marginBottom: compact ? 0 : 10,
            background: 'var(--color-surface-2)', cursor: 'pointer',
            maxHeight: cap, maxWidth: '100%',
            ...(ratio
              ? { width: boxWidth, aspectRatio: `${m.width}/${m.height}` }
              : m.media_type === 'image'
                // No stored dimensions for this image - don't guess a box
                // shape (a wrong guess crops real content). Let it size
                // itself: display:inline-block so the div hugs the img's
                // own natural width instead of stretching to the column.
                ? { display: 'inline-block' }
                // Video still needs a definite box before it loads (for the
                // autoplay observer), so it keeps a 16/9 placeholder shape.
                : { width: '100%', aspectRatio: '16/9' }),
          }}
        >
          {m.media_type === 'image'
            ? <ProgressiveImage src={m.url} width={900} fit={ratio ? 'cover' : 'natural'} maxHeight={cap} />
            : <GatedMedia render={() => <TrackedVideo src={m.url} poster={videoPoster(m.url, m.thumbnail_url)} postId={postId} width={m.width} height={m.height} registry={inlineVideos.current} index={0} />} />
          }
        </div>
        </div>
        {!compact && viewerIdx !== null && (
          <MediaViewer
            media={sorted} initialIndex={viewerIdx} post={post}
            initialVideoTime={viewerStartTime} onVideoTime={syncInlineVideoTime}
            onClose={() => setViewerIdx(null)}
          />
        )}
      </>
    )
  }

  // Multiple items - matches the reference: tight tiles, 3px gap. In the feed
  // the tiles are PORTRAIT and big enough to read without opening them. The
  // compact quoted-post embed keeps its small squares. Exactly 2 items fill the row edge-to-edge,
  // same as X's static grid. 3+ items scroll horizontally (X can't show more
  // than 2-4 in a static grid at all - this is the one deliberate departure,
  // since the ask was specifically to make extra photos reachable by swipe).
  // Two or more photos scroll sideways (X-style): tiles keep a relaxed width so
  // the next photo peeks in from the edge instead of every photo being squeezed
  // into the frame. Only the small quoted-post embed keeps its squeezed pair.
  const scrolls = sorted.length > 2 || (!compact && sorted.length === 2)

  return (
    <>
      <div
        ref={scrollerRef}
        className="media-scroller"
        style={{
          display: 'flex', gap: 3, borderRadius: radius, overflow: scrolls ? 'auto' : 'hidden',
          marginBottom: compact ? 0 : 10,
          scrollSnapType: scrolls ? 'x mandatory' : undefined,
          WebkitOverflowScrolling: 'touch',
          maxHeight: compact ? cap : undefined,
          // Stops horizontal swipes through multi-image posts from being
          // mistaken for the browser/app's edge-swipe "back" gesture once
          // the scroller hits its start/end.
          overscrollBehaviorX: 'contain',
        }}
      >
        {sorted.map((m, i) => (
          <div
            key={m.id || i}
            onClick={compact ? undefined : (e => openViewer(i, e))}
            style={{
              // ~59% wide, 3:4 tall, so the next photo peeks in and invites the swipe
              flex: scrolls ? (compact ? '0 0 48%' : '0 0 59%') : '1 1 50%',
              scrollSnapAlign: scrolls ? 'start' : undefined,
              aspectRatio: compact ? '1/1' : '3/4', overflow: 'hidden',
              background: 'var(--color-surface-2)', position: 'relative',
              cursor: 'pointer',
            }}
          >
            {m.media_type === 'image'
              ? <ProgressiveImage src={m.url} width={compact ? 480 : 700} fit="cover" />
              : <GatedMedia render={() => <TrackedVideo src={m.url} poster={videoPoster(m.url, m.thumbnail_url)} postId={postId} registry={inlineVideos.current} index={i} />} />
            }
          </div>
        ))}
        <style>{`.media-scroller::-webkit-scrollbar { display: none; }`}</style>
      </div>

      {!compact && viewerIdx !== null && (
        <MediaViewer
          media={sorted}
          initialIndex={viewerIdx}
          post={post}
          initialVideoTime={viewerStartTime}
          onVideoTime={syncInlineVideoTime}
          onClose={() => setViewerIdx(null)}
        />
      )}
    </>
  )
}

// ── QuoteModal ────────────────────────────────────────────────────────────────
// Bordered card for a quoted post: small header, text, then single media running
// edge to edge and centred. Used in the feed and in the quote modal (no onOpen
// there, so it is just a preview).
// `borderColor`: the default border token equals the modal's own surface colour in
// dark mode (both #1E1E26), so inside the quote composer it is passed a stronger one.
function QuotedEmbed({ q, onOpen, borderColor = 'var(--color-border)' }: { q: NonNullable<FeedPost['quoted_post']>; onOpen?: () => void; borderColor?: string }) {
  const single = (q.media?.length ?? 0) === 1
  return (
    <div
      onClick={onOpen ? (e => { e.stopPropagation(); onOpen() }) : undefined}
      style={{ border: `1px solid ${borderColor}`, borderRadius: 16, marginBottom: 10, cursor: onOpen ? 'pointer' : 'default', overflow: 'hidden', transition: 'background 0.12s' }}
      onMouseEnter={onOpen ? (e => { e.currentTarget.style.background = 'var(--color-surface-2)' }) : undefined}
      onMouseLeave={onOpen ? (e => { e.currentTarget.style.background = 'transparent' }) : undefined}
    >
      <div style={{ padding: '10px 12px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 4 }}>
          <Avatar name={q.author?.display_name || 'S'} avatarUrl={q.author?.avatar_url} size={20} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif" }}>{q.author?.display_name}</span>
          {q.author?.verification_tier && q.author.verification_tier !== 'none' && (
            <VerifiedBadge tier={q.author.verification_tier} size={13} />
          )}
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>@{q.author?.username}</span>
          <span style={{ fontSize: 12, color: 'var(--color-border-light)' }}>·</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{formatRelativeTime(q.created_at)}</span>
        </div>
        {q.body?.trim() && <div style={{ paddingBottom: q.media?.length ? 10 : 0 }}><TruncatedBody text={q.body} postId={q.id} fontSize={14} /></div>}
      </div>
      {q.media && q.media.length > 0 && (
        <div style={single ? undefined : { padding: '0 12px' }}>
          <MediaRow media={q.media} postId={q.id} post={q as unknown as FeedPost} compact bleed={single} />
        </div>
      )}
      {!(single && q.media?.length) && <div style={{ height: 10 }} />}
    </div>
  )
}

const QUOTE_PREVIEW_BORDER = 'color-mix(in srgb, var(--color-text-muted) 45%, transparent)'

// Placeholder for the audience picker ("Everyone" / who can reply). Not wired to
// anything yet - there is no audience setting on posts - so it is shown but inert.
function AudiencePill() {
  return (
    <span
      title="Coming soon"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
        padding: '2px 12px', borderRadius: 999, border: '1px solid var(--color-border-light)',
        color: 'var(--color-brand)', fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
        cursor: 'default', userSelect: 'none',
      }}
    >
      Everyone <ChevronDown size={14} />
    </span>
  )
}

function ComposerAvatar({ name, url, size }: { name: string; url?: string | null; size: number }) {
  const colors = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A1A4A', '#4A7A1A']
  const bg = colors[name.charCodeAt(0) % colors.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: url ? 'transparent' : bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: size * 0.36, color: 'white',
    }}>
      {url ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : name.slice(0, 2).toUpperCase()}
    </div>
  )
}

let viewerIdentityCache: { display_name: string; avatar_url: string | null } | null = null

function QuoteModal({ post, onClose, currentUserId }: { post: FeedPost; onClose: () => void; currentUserId?: string }) {
  const { t } = useTranslation()
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const { success, error: toastError } = useToast()
  // Portaled to document.body below — see the note on ConfirmModal for why.
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [viewer, setViewer] = useState<{ display_name: string; avatar_url: string | null } | null>(null)
  const [showDrafts, setShowDrafts] = useState(false)
  useEffect(() => {
    setMounted(true)
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  // On a phone the quote composer is a full page, so the page behind must not scroll.
  useEffect(() => {
    if (!isMobile) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isMobile])
  // The quoter's own avatar (the feed card only knows their id). Fetched once and
  // reused, so reopening the composer doesn't flash initials again.
  useEffect(() => {
    if (!currentUserId) return
    if (viewerIdentityCache) { setViewer(viewerIdentityCache); return }
    let cancelled = false
    void getViewerIdentityAction()
      .then(v => { if (v) { viewerIdentityCache = v; if (!cancelled) setViewer(v) } })
      .catch(() => { /* initials fallback */ })
    return () => { cancelled = true }
  }, [currentUserId])

  function handleQuote() {
    if (!body.trim()) { setError(t('post.quote_needs_content')); return }
    startTransition(async () => {
      const result = await createPostAction({ body: body.trim(), quoted_post_id: post.id })
      if ('error' in result && result.error) { setError(result.error); toastError(result.error); return }
      if ('support' in result && result.support) showSupportResources()
      success(t('post.quote_posted'))
      onClose()
    })
  }

  if (!mounted) return null

  const canPost = !!body.trim() && !isPending
  const viewerName = viewer?.display_name || 'Me'
  const quoteLabel = isPending ? t('post.quoting') : t('post.quote')
  const draftsBtn = currentUserId ? (
    <button
      onClick={() => setShowDrafts(true)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-brand)', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", padding: '6px 4px' }}
    >
      Drafts
    </button>
  ) : <span />
  const closeBtn = (size: number) => (
    <button
      onClick={onClose}
      aria-label={t('common.cancel')}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)', padding: 6, borderRadius: '50%', display: 'flex', marginLeft: -6 }}
    >
      <X size={size} />
    </button>
  )
  // Avatar on the left; on the right the comment box with the quoted post
  // indented underneath it (same left edge as the text).
  const composer = (avatarSize: number, fontSize: number, showPill: boolean) => (
    <div style={{ display: 'flex', gap: 12 }}>
      <ComposerAvatar name={viewerName} url={viewer?.avatar_url} size={avatarSize} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {showPill && <AudiencePill />}
        <textarea
          autoFocus value={body}
          onChange={e => { setBody(e.target.value); setError('') }}
          placeholder={t('post.add_comment_placeholder')} maxLength={500} rows={3}
          style={{ width: '100%', background: 'transparent', border: 'none', padding: showPill ? '8px 0 12px' : '8px 0 14px', fontSize, color: 'var(--color-text-primary)', fontFamily: "'DM Sans',sans-serif", resize: 'none', outline: 'none', boxSizing: 'border-box' }}
        />
        <QuotedEmbed q={post as unknown as NonNullable<FeedPost['quoted_post']>} borderColor={QUOTE_PREVIEW_BORDER} />
        {error && <p style={{ fontSize: 13, color: 'var(--color-error)', marginTop: 2 }}>{error}</p>}
      </div>
    </div>
  )
  const draftsPanel = showDrafts && currentUserId && (
    <DraftsPanel
      userId={currentUserId}
      onClose={() => setShowDrafts(false)}
      // A draft is text (+ media); a quote only takes the text.
      onEditDraft={draft => { setBody(draft.body.slice(0, 500)); setShowDrafts(false) }}
    />
  )

  // Mobile: a standalone full-screen page (above the bottom nav), not a modal.
  if (isMobile) {
    return createPortal(
      <>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', inset: 0, zIndex: 350, display: 'flex', flexDirection: 'column',
            background: 'var(--color-bg)', animation: 'quotePageIn 0.18s ease-out',
            paddingTop: 'env(safe-area-inset-top, 0px)',
          }}
        >
          {/* Top bar: close left, Drafts + Post right */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>
            {closeBtn(24)}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {draftsBtn}
              <button
                onClick={handleQuote}
                disabled={!canPost}
                style={{ padding: '9px 20px', borderRadius: 20, border: 'none', background: canPost ? 'var(--color-brand)' : 'var(--color-surface-2)', color: canPost ? 'white' : 'var(--color-text-muted)', cursor: canPost ? 'pointer' : 'not-allowed', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15 }}
              >
                {quoteLabel}
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px' }}>
            {composer(40, 19, false)}
          </div>

          {/* Bottom: audience placeholder + counter */}
          <div style={{ borderTop: '1px solid var(--color-border-light)', padding: '12px 16px calc(env(safe-area-inset-bottom, 0px) + 12px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span title="Coming soon" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--color-brand)', fontSize: 14, fontWeight: 600, cursor: 'default' }}>
              <Globe size={16} /> Everyone can reply
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('post.chars_left', { count: 500 - body.length })}</span>
          </div>
          <style>{`@keyframes quotePageIn { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:none; } }`}</style>
        </div>
        {draftsPanel}
      </>,
      document.body
    )
  }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--overlay-bg)', zIndex: 200 }} />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)', width: 'min(600px, 95vw)',
          maxHeight: '90dvh', overflowY: 'auto',
          background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-light)',
          borderRadius: 20, padding: '12px 16px 16px', zIndex: 201, animation: 'modalIn 0.18s ease',
          boxSizing: 'border-box',
        }}
      >
        {/* Header: close left, Drafts right */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          {closeBtn(20)}
          {draftsBtn}
        </div>

        {composer(40, 18, true)}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--color-border-light)' }}>
          <span title="Coming soon" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--color-brand)', fontSize: 14, fontWeight: 600, cursor: 'default' }}>
            <Globe size={15} /> Everyone can reply
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('post.chars_left', { count: 500 - body.length })}</span>
            <button onClick={handleQuote} disabled={!canPost} style={{ padding: '9px 20px', borderRadius: 20, border: 'none', background: canPost ? 'var(--color-brand)' : 'var(--color-surface-2)', color: canPost ? 'white' : 'var(--color-text-muted)', cursor: canPost ? 'pointer' : 'not-allowed', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14 }}>
              {quoteLabel}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes modalIn { from { opacity:0;transform:translateY(-10px) scale(0.98); } to { opacity:1;transform:none; } }`}</style>
      {draftsPanel}
    </>,
    document.body
  )
}

// ── ActionBtn ─────────────────────────────────────────────────────────────────
// ── MenuItems ─────────────────────────────────────────────────────────────────
// Shared list of "..." menu actions - rendered inside a bottom sheet on mobile
// and a compact anchored popup on desktop (same items, different container).
function MenuItems({
  isOwnPost, bookmarked, isPinned,
  onPromote, onPin, onBookmark, onCopyLink, onShare, onDelete, onReport,
  size, fontSize, gap, padding,
}: {
  isOwnPost: boolean; bookmarked: boolean; isPinned: boolean
  onPromote: () => void; onPin: (e: React.MouseEvent) => void
  onBookmark: (e: React.MouseEvent) => void; onCopyLink: (e: React.MouseEvent) => void
  onShare: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void; onReport: (e: React.MouseEvent) => void
  size: number; fontSize: number; gap: number; padding: string
}) {
  const { t } = useTranslation()
  const itemStyle = (color: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap, width: '100%', padding,
    background: 'none', border: 'none', borderRadius: size >= 18 ? 12 : 8,
    cursor: 'pointer', color, fontSize, fontFamily: "'DM Sans',sans-serif",
    whiteSpace: 'nowrap',
  })

  return (
    <>
      {isOwnPost && (
        <>
          <button onClick={e => { e.stopPropagation(); onPromote() }} style={itemStyle('#1A9E5F')}>
            <Megaphone size={size} /> {t('post.promote_post')}
          </button>
          <button onClick={onPin} style={itemStyle('var(--color-text-primary)')}>
            {isPinned ? <PinOff size={size} /> : <Pin size={size} />}
            {isPinned ? t('post.unpin_from_profile') : t('post.pin_to_profile')}
          </button>
        </>
      )}
      <button onClick={onBookmark} style={itemStyle('var(--color-text-primary)')}>
        <Bookmark size={size} fill={bookmarked ? 'var(--color-gold)' : 'none'} color={bookmarked ? 'var(--color-gold)' : 'currentColor'} />
        {bookmarked ? t('post.saved') : t('post.save')}
      </button>
      <button onClick={onCopyLink} style={itemStyle('var(--color-text-primary)')}>
        <Link2 size={size} /> {t('post.copy_link')}
      </button>
      <button onClick={onShare} style={itemStyle('var(--color-text-primary)')}>
        <Send size={size} /> {t('post.share')}
      </button>
      {isOwnPost && (
        <button onClick={onDelete} style={itemStyle('var(--color-error)')}>
          <Trash2 size={size} /> {t('post.delete_post_menu')}
        </button>
      )}
      <button onClick={onReport} style={itemStyle('var(--color-text-secondary)')}>
        <Flag size={size} /> {t('post.report_post')}
      </button>
    </>
  )
}

function ActionBtn({ icon, count, active, activeColor, onClick, label, showZero = false, burst = false }: {
  icon: React.ReactNode; count: number | null; active: boolean; activeColor: string
  onClick: (e: React.MouseEvent) => void; label: string; showZero?: boolean; burst?: boolean
}) {
  const [animating, setAnimating] = useState(false)
  const wasActive = useRef(active)
  // Guards against a fast double-tap registering as two taps (a common
  // mobile mis-touch): without this, the second phantom tap fires right
  // after the first and immediately undoes it, making the action look like
  // it "reverted" even though the user never touched back/navigated away.
  const lastTapAt = useRef(0)

  useEffect(() => {
    if (burst && active && !wasActive.current) {
      setAnimating(true)
      const t = setTimeout(() => setAnimating(false), 550)
      return () => clearTimeout(t)
    }
    wasActive.current = active
  }, [active, burst])

  const particles = animating ? Array.from({ length: 6 }) : []

  return (
    <button
      onClick={e => {
        e.stopPropagation()
        const now = Date.now()
        if (now - lastTapAt.current < 350) return
        lastTapAt.current = now
        onClick(e)
      }}
      aria-label={label}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        background: 'none', border: 'none', cursor: 'pointer',
        color: active ? activeColor : 'var(--color-text-muted)',
        padding: '8px 10px', borderRadius: 20, fontSize: 13,
        fontFamily: "'DM Sans',sans-serif", transition: 'color 0.12s, background 0.12s',
        WebkitTapHighlightColor: 'transparent',
        minHeight: 40, touchAction: 'manipulation',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-3)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
    >
      <span style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        animation: animating ? 'actionPop 0.5s ease' : 'none',
      }}>
        {icon}
        {particles.map((_, i) => {
          const angle = (i / particles.length) * 2 * Math.PI
          const dist = 14
          const tx = Math.cos(angle) * dist
          const ty = Math.sin(angle) * dist
          return (
            <span
              key={i}
              style={{
                position: 'absolute', top: '50%', left: '50%',
                width: 4, height: 4, borderRadius: '50%',
                background: activeColor,
                ['--tx' as any]: `${tx}px`,
                ['--ty' as any]: `${ty}px`,
                animation: 'particleBurst 0.5s ease-out forwards',
              }}
            />
          )
        })}
      </span>
      <span style={{ fontSize: 12, minWidth: 14, textAlign: 'left', color: 'var(--color-text-muted)' }}>
        {count !== null ? (count > 0 ? formatNumber(count) : showZero ? '0' : '') : ''}
      </span>
    </button>
  )
}

// ── PostActions - shared action bar used in both PostCard and RepostCard ──────
export function PostActions({
  post,
  currentUserId,
  onReplyClick,
  isReply = false,
  repostTarget,
}: {
  post: FeedPost
  currentUserId?: string
  onReplyClick?: () => void
  isReply?: boolean
  // Set when `post` is itself a repost row. Like, comment and analytics then
  // belong to the repost, but the Repost / Quote buttons still act on the
  // ORIGINAL post (reposting a repost reposts the original, as on X).
  repostTarget?: FeedPost
}) {
  const { t } = useTranslation()
  const [, startTransition] = useTransition()
  const rt = repostTarget ?? post
  const isOwnPost = !!currentUserId && post.author?.id === currentUserId
  // Like / repost state is shared per post (lib/engagement-state), so the feed
  // card and e.g. the full-screen viewer's sidebar always agree, instantly. The
  // heart/count reflect the tap in the same render; the count is derived from
  // the server's last count +/- the person's own not-yet-confirmed change, so it
  // stays right whether or not a fresh snapshot has arrived, and live counts from
  // other people (the feed's periodic refresh) flow through without disturbing it.
  const likeOv = useEngagementOverride('like', post.id)
  const repostOv = useEngagementOverride('repost', rt.id)
  const liked = likeOv ? likeOv.active : post.is_liked
  const reposted = repostOv ? repostOv.active : rt.is_reposted
  const likeCount = Math.max(0, post.likes_count + (liked === post.is_liked ? 0 : liked ? 1 : -1))
  // On a repost card the number is the REPOST's own count (it is its own post), not
  // the original's - otherwise both cards read "1" the moment someone reposts.
  const repostCount = repostTarget
    ? Math.max(0, post.reposts_count ?? 0)
    : Math.max(0, (rt.reposts_count ?? 0) + (reposted === rt.is_reposted ? 0 : reposted ? 1 : -1))
  useEffect(() => { settleEngagement('like', post.id, post.is_liked) }, [post.id, post.is_liked, likeOv])
  useEffect(() => { settleEngagement('repost', rt.id, rt.is_reposted ?? false) }, [rt.id, rt.is_reposted, repostOv])
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
    // Instant: heart and count both derive from this, on every copy of the post.
    const seq = beginEngagement('like', post.id, nextLiked, post.is_liked)
    startTransition(async () => {
      let undoTo: boolean | undefined
      try {
        // Ask for the state the person wants, not a blind flip: a double tap, a
        // stale screen or a second device can no longer bounce the like back.
        const r = await toggleLikeAction(post.id, nextLiked)
        if ('error' in r) undoTo = !nextLiked
      } catch {
        undoTo = !nextLiked // network/server failure: never leave a phantom like
      }
      endEngagement('like', post.id, seq, undoTo)
      if (undoTo !== undefined) toastError(t('post.update_failed'))
    })
  }

  function handleRepost(e: React.MouseEvent) {
    e.stopPropagation()
    const nextReposted = !reposted
    setShowRepostMenu(false)
    const seq = beginEngagement('repost', rt.id, nextReposted, rt.is_reposted ?? false)
    startTransition(async () => {
      let undoTo: boolean | undefined
      try {
        const r = await toggleRepostAction(rt.id, nextReposted)
        if ('error' in r) undoTo = !nextReposted
        else if (nextReposted && 'post' in r && r.post) publishFeedEvent({ type: 'repost-added', post: r.post })
        else if (!nextReposted) publishFeedEvent({ type: 'repost-removed', originalId: rt.id })
      } catch {
        undoTo = !nextReposted
      }
      endEngagement('repost', rt.id, seq, undoTo)
      if (undoTo !== undefined) toastError(t('post.repost_failed'))
      else success(nextReposted ? t('post.reposted') : t('post.repost_removed'))
    })
  }



  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 4, marginTop: 8 }}>
        <div>
          <ActionBtn
            icon={<MessageCircle size={18} />}
            count={post.comments_count}
            active={false} activeColor="#378ADD"
            onClick={e => {
              e.stopPropagation()
              if (onReplyClick) onReplyClick()
              else router.push(`/post/${post.id}`)
            }}
            label={t('post.reply')}
          />
        </div>

        <div ref={repostRef} style={{ position: 'relative' }}>
          <ActionBtn
            icon={<Repeat2 size={18} />} count={repostCount}
            active={repostTarget ? false : reposted} activeColor="var(--color-brand)"
            onClick={e => { e.stopPropagation(); setShowRepostMenu(v => !v) }}
            label={t('post.repost')}
          />
          {showRepostMenu && (
            <div
              onClick={e => e.stopPropagation()}
              style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, zIndex: 30, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 6, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}
            >
              <button onClick={handleRepost} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', color: reposted ? 'var(--color-brand)' : 'var(--color-text-primary)', fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}>
                <Repeat2 size={16} /> {reposted ? t('post.undo_repost') : t('post.repost')}
              </button>
              <button onClick={e => { e.stopPropagation(); setShowRepostMenu(false); setShowQuoteModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'var(--color-text-primary)', fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}>
                <Quote size={16} /> {t('post.quote_post_title')}
              </button>
            </div>
          )}
        </div>

        <div>
          <ActionBtn
            icon={<Heart size={18} fill={liked ? 'var(--color-brand)' : 'none'} />}
            count={likeCount} active={liked} activeColor="var(--color-brand)"
            onClick={handleLike} label={t('post.like')} burst
          />
        </div>

        {/* Impressions/"Post activity" - a top-level-post analytics feature.
            Not shown on a comment row: hidden whenever isReply. */}
        {!isReply && (
          <div>
            <ActionBtn
              icon={<BarChart2 size={17} />}
              count={post.impressions_count > 0 ? post.impressions_count : null}
              active={false} activeColor="var(--color-brand)"
              onClick={e => { e.stopPropagation(); router.push(`/post/${post.id}/activity`) }}
              label={t('post.impressions')}
            />
          </div>
        )}

        {/* Escrow pay button - only shown when the author explicitly marked
            this post as selling something (post.is_selling), set via the
            composer toggle. See lib/actions/escrow.ts for the payment +
            hold logic, and post-modal.tsx for where the toggle lives. */}
        {!isOwnPost && post.author?.username && post.is_selling && (
          <div style={{ marginLeft: 'auto' }} onClick={e => e.stopPropagation()}>
            <PayVendorButton
              sellerUsername={post.author.username}
              sellerDisplayName={post.author.display_name || post.author.username}
              postId={post.id}
              itemDescription={post.body}
              compact
            />
          </div>
        )}
      </div>

      {showQuoteModal && <QuoteModal post={rt} currentUserId={currentUserId} onClose={() => setShowQuoteModal(false)} />}
    </>
  )
}

// ── RepostCard ────────────────────────────────────────────────────────────────
const TRUNCATE_MAX_LINES = 8

// Shortens long text so one post can't fill the whole screen: by characters
// (cut at a word boundary) and by line count (a post of many short lines is
// just as tall as one long paragraph).
function truncateText(text: string, limit: number): string | null {
  const lines = text.split('\n')
  const tooManyLines = lines.length > TRUNCATE_MAX_LINES
  if (!tooManyLines && text.length <= limit) return null
  let out = tooManyLines ? lines.slice(0, TRUNCATE_MAX_LINES).join('\n') : text
  if (out.length > limit) {
    const cut = out.slice(0, limit)
    const lastSpace = cut.lastIndexOf(' ')
    out = lastSpace > 0 ? cut.slice(0, lastSpace) : cut
  }
  return out.trimEnd()
}

function TruncatedBody({ text, limit = 240, postId, fontSize = 15 }: { text: string; limit?: number; postId: string; fontSize?: number }) {
  const [expanded, setExpanded] = useState(false)
  const truncated = truncateText(text, limit)
  const needsTruncation = truncated !== null
  const pStyle = { fontSize, color: 'var(--color-text-primary)', lineHeight: 1.6, wordBreak: 'break-word' as const, whiteSpace: 'pre-wrap' as const }

  if (!needsTruncation || expanded) {
    return (
      <p style={pStyle}>
        {linkifyPostText(text)}
        {needsTruncation && (
          <>
            {' '}
            <span
              onClick={e => { e.stopPropagation(); setExpanded(false) }}
              style={{ color: 'var(--color-brand)', cursor: 'pointer', fontWeight: 600 }}
            >
              Show less
            </span>
          </>
        )}
      </p>
    )
  }

  return (
    <p style={pStyle}>
      {linkifyPostText(closeCutBold(truncated))}
      {'... '}
      <span
        onClick={e => {
          e.stopPropagation()
          setExpanded(true)
          void recordDetailExpandAction(postId)
        }}
        style={{ color: 'var(--color-brand)', cursor: 'pointer', fontWeight: 600 }}
      >
        Read more
      </span>
    </p>
  )
}

// A repost is its own post (its own row): it has its own likes, comments and
// analytics, and opens its own detail page. The original post is embedded inside
// it, untouched, and tapping the embedded card goes to the original.
function RepostCard({ post, currentUserId, onReplyClick }: { post: FeedPost; currentUserId?: string; onReplyClick?: () => void }) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const original = post.quoted_post
  if (!original) return null

  // The original as a FeedPost, so the Repost / Quote buttons (and the media
  // viewer) can act on it.
  const originalAsPost: FeedPost = {
    ...(original as any),
    is_liked: (original as any).is_liked ?? false,
    is_reposted: (original as any).is_reposted ?? false,
    is_bookmarked: (original as any).is_bookmarked ?? false,
    impressions_count: (original as any).impressions_count ?? 0,
    likes_count: (original as any).likes_count ?? 0,
    reposts_count: (original as any).reposts_count ?? 0,
    comments_count: (original as any).comments_count ?? 0,
  }

  return (
    <article
      onClick={() => { if (pathname !== `/post/${post.id}`) router.push(`/post/${post.id}`) }}
      onCopy={e => e.preventDefault()}
      style={{
        padding: '10px 16px 14px',
        borderBottom: '1px solid var(--color-border)',
        cursor: 'pointer',
        transition: 'background 0.12s',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {/* Repost line - the only thing that differs from a normal post */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, paddingLeft: 30 }}>
        <Repeat2 size={14} color="var(--color-text-muted)" />
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontFamily: "'DM Sans',sans-serif" }}>
          <span
            onClick={e => { e.stopPropagation(); router.push(currentUserId && post.author.id === currentUserId ? '/profile' : `/user/${post.author.username}`) }}
            style={{ color: 'var(--color-text-secondary)', fontWeight: 600, cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}
          >
            {post.author.display_name}
          </span>
          {' '}{t('post.reposted_by_label')}
        </span>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>· {formatRelativeTime(post.created_at)}</span>
      </div>

      {/* Normal post layout, showing the original post */}
      <div style={{ display: 'flex', gap: 12 }}>
        <Avatar name={original.author?.display_name || 'S'} avatarUrl={original.author?.avatar_url} username={original.author?.username} clickable postId={original.id} isOwn={!!currentUserId && original.author?.id === currentUserId} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 3 }}>
            <span
              onClick={e => {
                e.stopPropagation()
                if (currentUserId && original.author.id === currentUserId) { router.push('/profile'); return }
                void recordProfileVisitFromPostAction(original.id)
                router.push(`/user/${original.author.username}`)
              }}
              style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif", cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
            >
              {original.author.display_name}
            </span>
            {original.author.verification_tier !== 'none' && (
              <VerifiedBadge tier={original.author.verification_tier} size={14} />
            )}
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>@{original.author.username}</span>
            <span style={{ fontSize: 12, color: 'var(--color-border-light)' }}>·</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{formatRelativeTime(original.created_at)}</span>
            {original.is_selling && (
              <Tag size={14} color="var(--color-brand)" aria-label={t('post.selling')} style={{ marginLeft: 2 }} />
            )}
          </div>

          {original.body?.trim() && (
            <div style={{ marginBottom: original.media?.length ? 12 : 10 }}>
              <TruncatedBody text={original.body} postId={original.id} />
            </div>
          )}

          {!original.media?.length && <LinkPreviewCard body={original.body} />}

          <MediaRow media={original.media} postId={original.id} post={originalAsPost} />

          {/* Action bar belongs to the repost itself; Repost / Quote target the original */}
          <PostActions post={post} repostTarget={originalAsPost} currentUserId={currentUserId} onReplyClick={onReplyClick} />
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
  isReply = false,
  hideBorder = false,
  replyingTo,
}: {
  post: FeedPost
  currentUserId?: string
  onReplyClick?: () => void
  // True when this card is a comment/reply row inside a thread (rendered via
  // ReplyToReply), rather than a top-level post in a feed. Two things differ:
  // whole-card tap doesn't navigate to `/post/${id}` (that used to fire on
  // ANY tap on the row - reading the reply body, the avatar, whitespace -
  // and it dumps you onto that reply's own separate detail page, which
  // reads as "just trying to see the existing replies opened a whole new
  // page." Replies are already shown inline right here; there's nowhere for
  // a tap on the row itself to usefully go. Only the Reply icon should ever
  // navigate, and it already does via onReplyClick. Also hides the
  // Impressions/"Post activity" icon - that's a top-level-post analytics
  // feature the Threads reference never shows on a comment row.
  isReply?: boolean
  // True for a top-level comment that has its own nested replies below it -
  // suppresses this card's own bottom border so the comment and its
  // replies read as one visual unit (approved prototype: a divider only
  // ever separates two *different* comment threads, never a comment from
  // its own replies).
  hideBorder?: boolean
  // Handle of the nested reply this row answers - set only on replies to a reply
  // (not on direct replies to the top-level comment). Renders a small
  // "Replying to @handle" line above the body.
  replyingTo?: string
}) {
  const { t } = useTranslation()
  const [, startTransition] = useTransition()
  const [bookmarked, setBookmarked] = useState(post.is_bookmarked)
  const [bookmarkCount, setBookmarkCount] = useState(post.bookmarks_count || 0)
  const [, startPinT] = useTransition()
  const [showMenu, setShowMenu] = useState(false)
  const [isMobile, setIsMobile] = useState(true)
  const [showPromoteModal, setShowPromoteModal] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [isPinned, setIsPinned] = useState(post.is_pinned ?? false)
  const [showPinConfirm, setShowPinConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Portaled to document.body below — see the note on ConfirmModal for why
  // (the mobile "more" action sheet would otherwise render trapped under
  // the mobile bottom nav, no matter its own z-index).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const router = useRouter()
  const { success, error: toastError, info } = useToast()
  const articleRef = useRef<HTMLElement>(null)
  const impressionFired = useRef(false)

  const isOwnPost = !!currentUserId && post.author?.id === currentUserId

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const isRepost = post.post_type === 'repost'

  // Fire impression once when post is 50% visible for >= 1 second
  useEffect(() => {
    if (impressionFired.current || isOwnPost) return
    const el = articleRef.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer = setTimeout(() => {
            if (!impressionFired.current) {
              impressionFired.current = true
              void recordImpressionAction(post.id)
              if (post.is_promoted && post.promotion_id) void recordPromotionImpressionAction(post.promotion_id)
            }
          }, 1000)
        } else {
          if (timer) clearTimeout(timer)
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(el)
    return () => { observer.disconnect(); if (timer) clearTimeout(timer) }
  }, [post.id, isOwnPost])

  if (deleted) return null
  // A repost counts its own impressions (it has its own analytics), so it gets
  // the same visibility observer as a normal card via this wrapper.
  if (isRepost) return (
    <div ref={articleRef as unknown as React.RefObject<HTMLDivElement>}>
      <RepostCard post={post} currentUserId={currentUserId} onReplyClick={onReplyClick} />
    </div>
  )

  function navigate(e: React.MouseEvent) {
    if (isReply) return
    // Prevent navigation when any interactive element is clicked
    const target = e.target as HTMLElement
    if (target.closest('button,a,textarea,input,video,[data-no-nav]')) return
    if (post.is_promoted && post.promotion_id) void recordPromotionClickAction(post.promotion_id)
    router.push(`/post/${post.id}`)
  }

  function handleBookmark(e: React.MouseEvent) {
    e.stopPropagation()
    setShowMenu(false)
    const next = !bookmarked
    setBookmarked(next)
    setBookmarkCount(c => next ? c + 1 : Math.max(0, c - 1))
    startTransition(async () => {
      const r = await toggleBookmarkAction(post.id)
      if ('error' in r) {
        setBookmarked(!next)
        setBookmarkCount(c => next ? Math.max(0, c - 1) : c + 1)
        toastError(t('post.save_failed'))
      } else {
        success(next ? t('post.saved_toast') : t('post.removed_from_saved'))
      }
    })
  }

  function handleCopyLink(e: React.MouseEvent) {
    e.stopPropagation()
    setShowMenu(false)
    const url = `${window.location.origin}/post/${post.id}`
    navigator.clipboard.writeText(url)
      .then(() => success(t('post.link_copied')))
      .catch(() => toastError(t('post.link_copy_failed')))
  }

  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation()
    setShowMenu(false)
    const url = `${window.location.origin}/post/${post.id}`
    try {
      if (navigator.share) await navigator.share({ title: post.author?.display_name, text: post.body || '', url })
      else { await navigator.clipboard.writeText(url); success(t('post.link_copied_clipboard')) }
    } catch { /* user dismissed share sheet */ }
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setShowMenu(false)
    setShowDeleteConfirm(true)
  }

  function confirmDelete() {
    setDeleting(true)
    startTransition(async () => {
      const r = await deletePostAction(post.id)
      setDeleting(false)
      if ('error' in r) {
        setShowDeleteConfirm(false)
        toastError(r.error || t('post.delete_failed'))
      } else {
        setShowDeleteConfirm(false)
        setDeleted(true)
        success(t('post.deleted'))
      }
    })
  }

  function handlePin(e: React.MouseEvent) {
    e.stopPropagation()
    setShowMenu(false)

    if (isPinned) {
      void (async () => {
        const r = await togglePinPostAction(post.id)
        if ('error' in r) { toastError((r as any).error || t('post.unpin_failed')); return }
        setIsPinned(false)
        success(t('post.unpinned'))
      })()
      return
    }

    void (async () => {
      const { hasPinnedPost } = await checkHasPinnedPostAction()
      if (hasPinnedPost) { setShowPinConfirm(true); return }
      const r = await togglePinPostAction(post.id)
      if ('error' in r) { toastError((r as any).error || t('post.pin_failed')); return }
      setIsPinned(true)
      success(t('post.pinned'))
    })()
  }

  function confirmReplace() {
    setShowPinConfirm(false)
    void (async () => {
      const r = await togglePinPostAction(post.id)
      if ('error' in r) { toastError((r as any).error || t('post.pin_failed')); return }
      setIsPinned(true)
      success(t('post.pinned'))
    })()
  }

  const author = post.author

  return (
    <>
      <article
        ref={articleRef}
        onClick={navigate}
        onCopy={e => e.preventDefault()}
        style={{
          padding: '14px 16px', borderBottom: hideBorder ? 'none' : '1px solid var(--color-border)',
          display: 'flex', gap: 12,
          transition: 'background 0.12s',
          cursor: isReply ? 'default' : 'pointer',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
        onMouseEnter={e => { if (!isReply) e.currentTarget.style.background = 'var(--color-surface-2)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <Avatar name={author?.display_name || 'S'} avatarUrl={author?.avatar_url} username={author?.username} clickable postId={post.id} isOwn={isOwnPost} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Promoted badge - same spot Pinned uses, shown instead of it when
              a post is both (unlikely, but promoted is the more relevant
              fact to surface: it's here because someone paid for reach). */}
          {post.is_promoted ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, paddingLeft: 2 }}>
              <Megaphone size={12} color="#1A9E5F" />
              <span style={{ fontSize: 12, color: '#1A9E5F', fontWeight: 500 }}>{t('post.promoted_badge')}</span>
            </div>
          ) : isPinned && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, paddingLeft: 2 }}>
              <Pin size={12} color="var(--color-text-muted)" />
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500 }}>Pinned</span>
            </div>
          )}
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
              <span
                onClick={e => {
                  e.stopPropagation()
                  if (isOwnPost) { router.push('/profile'); return }
                  if (author?.username) { void recordProfileVisitFromPostAction(post.id); router.push(`/user/${author.username}`) }
                }}
                style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif", cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
              >
                {author?.display_name}
              </span>
              {author?.verification_tier !== 'none' && (
                <VerifiedBadge tier={author.verification_tier} size={14} />
              )}
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>@{author?.username}</span>
              <span style={{ fontSize: 12, color: 'var(--color-border-light)' }}>·</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{formatRelativeTime(post.created_at)}</span>
              {post.edited_at && <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>· {t('post.edited_label')}</span>}
            </div>

            {/* More menu (+ small selling indicator, right next to it) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {post.is_selling && (
                <Tag size={14} color="var(--color-brand)" aria-label={t('post.selling')} />
              )}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={e => { e.stopPropagation(); setShowMenu(v => !v) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '4px 6px', borderRadius: 6 }}
                >
                  <MoreHorizontal size={16} />
                </button>
                {showMenu && (isMobile ? (mounted && createPortal(
                  <>
                    <div
                      onClick={e => { e.stopPropagation(); setShowMenu(false) }}
                      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)' }}
                    />
                    <div
                      onClick={e => e.stopPropagation()}
                      style={{
                        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 201,
                        background: 'var(--color-surface-raised)',
                        borderTopLeftRadius: 20, borderTopRightRadius: 20,
                        padding: '10px 8px calc(env(safe-area-inset-bottom, 0px) + 12px)',
                        boxShadow: '0 -8px 30px rgba(0,0,0,0.4)',
                        animation: 'sheetUp 0.18s ease-out',
                      }}
                    >
                      <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)', margin: '2px auto 10px' }} />
                      <MenuItems isOwnPost={isOwnPost} bookmarked={bookmarked} isPinned={isPinned}
                        onPromote={() => { setShowMenu(false); setShowPromoteModal(true) }}
                        onPin={handlePin} onBookmark={handleBookmark} onCopyLink={handleCopyLink} onShare={handleShare}
                        onDelete={handleDelete}
                        onReport={() => { setShowMenu(false); setShowReport(true) }}
                        size={18} fontSize={15} gap={12} padding="14px 16px" />
                    </div>
                    <style>{`@keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
                  </>,
                  document.body
                )) : (
                  <>
                    <div onClick={e => { e.stopPropagation(); setShowMenu(false) }} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
                    <div
                      onClick={e => e.stopPropagation()}
                      style={{
                        position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 201,
                        background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
                        borderRadius: 14, padding: 6, minWidth: 210,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                      }}
                    >
                      <MenuItems isOwnPost={isOwnPost} bookmarked={bookmarked} isPinned={isPinned}
                        onPromote={() => { setShowMenu(false); setShowPromoteModal(true) }}
                        onPin={handlePin} onBookmark={handleBookmark} onCopyLink={handleCopyLink} onShare={handleShare}
                        onDelete={handleDelete}
                        onReport={() => { setShowMenu(false); setShowReport(true) }}
                        size={15} fontSize={14} gap={8} padding="9px 12px" />
                    </div>
                  </>
                ))}
              </div>
            </div>
          </div>

          {replyingTo && (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 4 }}>
              Replying to <span style={{ color: 'var(--color-brand)' }}>@{replyingTo}</span>
            </div>
          )}

          {/* Body */}
          {post.body?.trim() && (
            <div style={{ marginBottom: (post.media?.length || post.quoted_post) ? 12 : 10 }}>
              <TruncatedBody text={post.body} postId={post.id} />
            </div>
          )}

          {/* Link preview: only when the post has no media or quote of its own */}
          {!post.media?.length && !post.quoted_post && <LinkPreviewCard body={post.body} />}

          {/* Quoted post embed */}
          {post.quoted_post && (
            <QuotedEmbed q={post.quoted_post} onOpen={() => router.push(`/post/${post.quoted_post!.id}`)} />
          )}

          {/* Media */}
          <MediaRow media={post.media} postId={post.id} post={post} />

          {/* Action bar */}
          <PostActions post={post} currentUserId={currentUserId} onReplyClick={onReplyClick} isReply={isReply} />

          {showPromoteModal && (
            <PromoteModal postId={post.id} onClose={() => setShowPromoteModal(false)} />
          )}

          {showReport && (
            <ReportDialog entityType="post" entityId={post.id} subject="post" onClose={() => setShowReport(false)} />
          )}
        </div>
      </article>

      {/* Pin replacement confirmation */}
      <ConfirmModal
        open={showPinConfirm}
        title={t('post.replace_pinned_confirm')}
        description={t('post.replace_pinned_desc')}
        confirmLabel={t('post.pin_this_post')}
        onConfirm={confirmReplace}
        onCancel={() => setShowPinConfirm(false)}
      />

      {/* Delete confirmation */}
      <ConfirmModal
        open={showDeleteConfirm}
        title={t('post.delete_confirm')}
        description={t('post.delete_post_desc')}
        confirmLabel={t('post.delete')}
        confirmingLabel={t('post.deleting')}
        destructive
        pending={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  )
}