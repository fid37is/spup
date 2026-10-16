// src/components/feed/post-card.tsx
'use client'

import { useState, useTransition, useEffect, useRef, useId } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Repeat2, Send, Bookmark, MoreHorizontal, Trash2, Flag, Pin, PinOff, Megaphone, Link2, Tag, Play, Volume2, VolumeX } from 'lucide-react'
import PromoteModal from './promote-modal'
import ReportDialog from './report-dialog'
import { toggleBookmarkAction, deletePostAction, recordImpressionAction, recordLinkClickAction, recordDetailExpandAction, recordProfileVisitFromPostAction, togglePinPostAction, checkHasPinnedPostAction, recordPromotionImpressionAction, recordPromotionClickAction } from '@/lib/actions'
import { formatRelativeTime } from '@/lib/utils'
import { shouldAutoplay } from '@/lib/autoplay'
import { trackVideoProgress } from '@/lib/video-analytics'
import {
  isInlineVideoSuspended, useInlineVideoSuspended,
  claimInlineAudio, releaseInlineAudio, useInlineAudioOwner,
} from '@/lib/video-focus'
import type { FeedPost } from '@/lib/actions/feed'
import { useToast } from '@/components/layout/toast'
import MediaViewer from '@/components/feed/media-viewer'
import { cloudinaryImage, fallbackToOriginal, videoPoster } from '@/lib/utils/cloudinary'
import { GatedMedia } from '@/components/media/media-gate'
import { ProgressiveImage } from '@/components/media/progressive-image'
import { linkifyPostText, closeCutBold } from '@/components/shared/linkify'
import LinkPreviewCard from '@/components/feed/link-preview-card'
import ConfirmModal from '@/components/ui/confirm-modal'
import { BottomDrawer, DrawerGroup, DrawerItem } from '@/components/ui/bottom-drawer'
import VerifiedBadge from '@/components/ui/verified-badge'
import { useTranslation } from '@/lib/i18n/language-context'
import { PostActions } from '@/components/feed/post-actions'

// Re-exported so existing imports of PostActions from here keep working.
export { PostActions }

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
function TrackedVideo({ src, poster, postId, width, height, registry, index, onDims }: {
  src: string; poster?: string; postId: string; width?: number | null; height?: number | null
  registry?: Map<number, HTMLVideoElement>; index?: number
  // Called once the browser knows the video's real size (single-video posts that
  // have no stored width/height use it to shape their frame).
  onDims?: (w: number, h: number) => void
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
        onLoadedMetadata={e => {
          const v = e.currentTarget
          if (onDims && v.videoWidth && v.videoHeight) onDims(v.videoWidth, v.videoHeight)
        }}
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

// Single photo / video sizing, modelled on Threads:
//  - PHOTOS fill the column width. A photo keeps its own shape but is never
//    narrower than 3:4: anything taller (phone screenshots, 9:16 shots) is
//    cropped from the centre, so one photo can't turn into a wall. Tapping it
//    opens the full, uncropped image in the viewer.
//  - VIDEOS keep their own orientation and are never cropped. The height is
//    capped instead, so a portrait video just gets narrower (flush left).
const SINGLE_PHOTO_CAP = 520
const SINGLE_VIDEO_CAP = 420
const PHOTO_MIN_RATIO = 3 / 4      // width / height

// `bleed` (quoted-post embed): a single item runs edge to edge across the embed,
// centred, with no rounding of its own (the embed's border clips the corners).
function MediaRow({ media, postId, post, compact = false, bleed = false }: { media: FeedPost['media']; postId: string; post: FeedPost; compact?: boolean; bleed?: boolean }) {
  const [viewerIdx, setViewerIdx] = useState<number | null>(null)
  // Where the inline copy of the video was when the viewer opened, so the
  // full-screen player continues from there rather than restarting.
  const [viewerStartTime, setViewerStartTime] = useState(0)
  const inlineVideos = useRef(new Map<number, HTMLVideoElement>())
  const scrollerRef = useRef<HTMLDivElement>(null)
  // Real size of a single video that has no stored dimensions (read from the file itself).
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null)
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

  // Single item - see SINGLE_* above. The frame's shape comes from the media's
  // real dimensions; its width is that shape against the height cap, so a
  // portrait video renders at its own narrower width (flush left - never
  // stretched or centered) and a landscape item fills the column.
  if (sorted.length === 1) {
    const m = sorted[0]
    const isVideo = m.media_type === 'video'
    const w = m.width || (isVideo ? measured?.w : null) || null
    const h = m.height || (isVideo ? measured?.h : null) || null
    const real = w && h ? w / h : null
    const ratio = real ? (isVideo ? real : Math.max(real, PHOTO_MIN_RATIO)) : null
    const cap = bleed ? 340 : compact ? 260 : isVideo ? SINGLE_VIDEO_CAP : SINGLE_PHOTO_CAP
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
              ? { width: boxWidth, aspectRatio: String(ratio) }
              : isVideo
                // Size not known yet: a 16/9 placeholder gives the autoplay
                // observer a definite box; it reshapes as soon as the video's
                // metadata arrives (onDims below).
                ? { width: '100%', aspectRatio: '16/9' }
                // No stored dimensions for this image - don't guess a box
                // shape (a wrong guess crops real content). Let it size
                // itself: display:inline-block so the div hugs the img's
                // own natural width instead of stretching to the column.
                : { display: 'inline-block' }),
          }}
        >
          {!isVideo
            ? <ProgressiveImage src={m.url} width={900} fit={ratio ? 'cover' : 'natural'} maxHeight={Math.min(cap, SINGLE_VIDEO_CAP)} />
            : <GatedMedia render={() => <TrackedVideo src={m.url} poster={videoPoster(m.url, m.thumbnail_url)} postId={postId} width={w} height={h} registry={inlineVideos.current} index={0} onDims={m.width && m.height ? undefined : (vw, vh) => setMeasured({ w: vw, h: vh })} />} />
          }
        </div>
        </div>
        {!compact && viewerIdx !== null && (
          <MediaViewer
            media={sorted} initialIndex={viewerIdx} post={post} previewWidth={900}
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
          maxHeight: compact ? (bleed ? 340 : 260) : undefined,
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
          previewWidth={700}
          initialVideoTime={viewerStartTime}
          onVideoTime={syncInlineVideoTime}
          onClose={() => setViewerIdx(null)}
        />
      )}
    </>
  )
}

// ── QuotedEmbed ───────────────────────────────────────────────────────────────
// Bordered card for a quoted post: small header, text, then single media running
// edge to edge and centred. Used in the feed and in the quote modal (no onOpen
// there, so it is just a preview).
// `borderColor`: the default border token equals the modal's own surface colour in
// dark mode (both #1E1E26), so inside the quote composer it is passed a stronger one.
export function QuotedEmbed({ q, onOpen, borderColor = 'var(--color-border)' }: { q: NonNullable<FeedPost['quoted_post']>; onOpen?: () => void; borderColor?: string }) {
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

// ── MenuItems ─────────────────────────────────────────────────────────────────
// The "..." menu actions as a compact anchored popup on desktop. On a phone the same
// actions render as a BottomDrawer (see PostCard); its rows have no click event to pass
// on, so they hand the handlers this stand-in.
const NO_EVENT = { stopPropagation: () => {} } as unknown as React.MouseEvent

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
  const pStyle = { fontSize, color: 'var(--color-text-primary)', lineHeight: 1.35, wordBreak: 'break-word' as const, whiteSpace: 'pre-wrap' as const }

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
                {showMenu && (isMobile ? (
                  // Same BottomDrawer as the repost / media menus: rounded sheet, drag handle,
                  // rows grouped in soft cards, label left and icon right.
                  <BottomDrawer open onClose={() => setShowMenu(false)} label={t('profile.more_options')}>
                    {isOwnPost && (
                      <DrawerGroup>
                        <DrawerItem
                          label={t('post.promote_post')} color="#1A9E5F" icon={<Megaphone size={22} />}
                          onClick={() => { setShowMenu(false); setShowPromoteModal(true) }}
                        />
                        <DrawerItem
                          label={isPinned ? t('post.unpin_from_profile') : t('post.pin_to_profile')}
                          icon={isPinned ? <PinOff size={22} /> : <Pin size={22} />}
                          onClick={() => handlePin(NO_EVENT)}
                        />
                      </DrawerGroup>
                    )}
                    <DrawerGroup>
                      <DrawerItem
                        label={bookmarked ? t('post.saved') : t('post.save')}
                        icon={<Bookmark size={22} fill={bookmarked ? 'var(--color-gold)' : 'none'} color={bookmarked ? 'var(--color-gold)' : 'currentColor'} />}
                        onClick={() => handleBookmark(NO_EVENT)}
                      />
                      <DrawerItem label={t('post.copy_link')} icon={<Link2 size={22} />} onClick={() => handleCopyLink(NO_EVENT)} />
                      <DrawerItem label={t('post.share')} icon={<Send size={22} />} onClick={() => handleShare(NO_EVENT)} />
                    </DrawerGroup>
                    <DrawerGroup>
                      {isOwnPost && (
                        <DrawerItem
                          label={t('post.delete_post_menu')} destructive icon={<Trash2 size={22} />}
                          onClick={() => handleDelete(NO_EVENT)}
                        />
                      )}
                      <DrawerItem
                        label={t('post.report_post')} color="var(--color-text-secondary)" icon={<Flag size={22} />}
                        onClick={() => { setShowMenu(false); setShowReport(true) }}
                      />
                    </DrawerGroup>
                  </BottomDrawer>
                ) : (
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