// src/components/feed/post-actions.tsx
'use client'

// The action row under a post: reply, repost, like, post activity and the
// pay-vendor button, plus the repost options drawer. Used by PostCard,
// RepostCard and the media viewer. Moved out of post-card.tsx unchanged apart
// from the like colour/sound added since. Change the buttons here.

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, RefreshCw, Heart, BarChart2, Quote } from 'lucide-react'
import { playLikeSound } from '@/lib/like-sound'
import { toggleLikeAction, toggleRepostAction } from '@/lib/actions'
import { formatNumber } from '@/lib/utils'
import { useEngagementOverride, beginEngagement, endEngagement, settleEngagement } from '@/lib/engagement-state'
import type { FeedPost } from '@/lib/actions/feed'
import { useToast } from '@/components/layout/toast'
import PayVendorButton from '@/components/escrow/pay-vendor-button'
import { publishFeedEvent } from '@/lib/feed-local-events'
import { BottomDrawer, DrawerGroup, DrawerItem } from '@/components/ui/bottom-drawer'
import { useTranslation } from '@/lib/i18n/language-context'
import { QuoteModal } from './quote-modal'

// Liked heart colour - matches the like notification (PINK in notifications-client.tsx).
// Same on light and dark themes and on the media viewer's black background.
const LIKE_RED = '#F91880'
// Green for a reposted post (icon and count), readable on light, dark and the viewer.
const REPOST_GREEN = '#00BA7C'

// ── LikeBurst ─────────────────────────────────────────────────────────────────
// The burst behind the heart when a post is liked, in the style of X: a soft
// circle swells out from behind the heart, and a ring of small dots drifts
// outward and fades. Subtle on purpose - the heart's own pop (actionPop) does
// most of the work. The keyframes (likeRing, likeDot) are in globals.css.
// Dot positions are fixed, so the burst looks the same every time.
const BURST_DOTS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * 2 * Math.PI - Math.PI / 2   // start at 12 o'clock
  const near = i % 2 === 0                         // alternate bigger/closer and smaller/softer
  const r1 = near ? 22 : 19
  return {
    x0: Math.cos(a) * 10, y0: Math.sin(a) * 10,    // start just outside the heart
    x1: Math.cos(a) * r1, y1: Math.sin(a) * r1,    // drift out to here
    size: near ? 4 : 3,
    opacity: near ? 1 : 0.6,
  }
})

function LikeBurst({ color }: { color: string }) {
  return (
    <>
      <span
        aria-hidden
        data-like-burst
        style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 26, height: 26, borderRadius: '50%',
          background: color, pointerEvents: 'none',
          animation: 'likeRing 0.45s ease-out forwards',
        }}
      />
      {BURST_DOTS.map((d, i) => (
        <span
          key={i}
          aria-hidden
          data-like-burst
          style={{
            position: 'absolute', top: '50%', left: '50%',
            width: d.size, height: d.size, borderRadius: '50%',
            background: color, opacity: d.opacity, pointerEvents: 'none',
            ['--x0' as any]: `${d.x0}px`, ['--y0' as any]: `${d.y0}px`,
            ['--x1' as any]: `${d.x1}px`, ['--y1' as any]: `${d.y1}px`,
            animation: 'likeDot 0.5s cubic-bezier(0.2, 0.7, 0.3, 1) 0.04s both',
          }}
        />
      ))}
    </>
  )
}

function ActionBtn({ icon, count, active, activeColor, onClick, label, showZero = false, burst = false, onDark = false }: {
  icon: React.ReactNode; count: number | null; active: boolean; activeColor: string
  onClick: (e: React.MouseEvent) => void; label: string; showZero?: boolean; burst?: boolean
  // On the media viewer's black background: white icons/counts instead of the theme's muted grey.
  onDark?: boolean
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
      const t = setTimeout(() => setAnimating(false), 600)
      return () => clearTimeout(t)
    }
    wasActive.current = active
  }, [active, burst])

    // No count, no space: an empty count used to reserve a fixed-width gap after the
  // icon, which is what made the row look spread out across the width.
  const countText = count !== null ? (count > 0 ? formatNumber(count) : showZero ? '0' : '') : ''
  const idleColor = onDark ? 'var(--viewer-fg)' : 'var(--color-text-muted)'

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
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: countText ? 6 : 0,
        background: 'none', border: 'none', cursor: 'pointer',
        color: active ? activeColor : idleColor,
        padding: '8px 10px', borderRadius: 20, fontSize: 13,
        fontFamily: "'DM Sans',sans-serif", transition: 'color 0.12s, background 0.12s',
        WebkitTapHighlightColor: 'transparent',
        minHeight: 40, touchAction: 'manipulation',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = onDark ? 'var(--viewer-control-bg)' : 'var(--color-surface-3)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
    >
      <span
        data-like-pop={animating ? '' : undefined}
        style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          animation: animating ? 'actionPop 0.45s ease-out' : 'none',
        }}
      >
        {animating && <LikeBurst color={activeColor} />}
        {icon}
      </span>
      {countText && (
        <span style={{ fontSize: 12, textAlign: 'left', color: active ? activeColor : idleColor, transition: 'color 0.12s' }}>
          {countText}
        </span>
      )}
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
  tone = 'default',
  flush = true,
  align = 'start',
  drawerBackdrop,
  onDrawerHeight,
}: {
  post: FeedPost
  currentUserId?: string
  onReplyClick?: () => void
  isReply?: boolean
  // 'onDark': white icons for the media viewer's black background.
  tone?: 'default' | 'onDark'
  // Pull the row left by the buttons' own padding so the first icon sits exactly
  // on the text's left edge (as in Threads). Turn off where the row has no
  // padding of its own to borrow from (the viewer's footer and sidebar).
  flush?: boolean
  // 'center' centres the buttons across the row (the media viewer's footer, as in
  // Threads); every other place keeps them left-aligned.
  align?: 'start' | 'center'
  // The media viewer passes these so the repost options drawer matches its other
  // drawers: a light shade over the picture, and the picture lifted above the sheet.
  drawerBackdrop?: string
  onDrawerHeight?: (px: number) => void
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
  // Repost options live in a bottom drawer (same component as the media viewer's
  // menus), not a popover anchored to the button.
  const [showRepostMenu, setShowRepostMenu] = useState(false)
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const onDark = tone === 'onDark'

  function handleLike(e: React.MouseEvent) {
    e.stopPropagation()
    const nextLiked = !liked
    if (nextLiked) playLikeSound() // on like only, not when un-liking
    // Instant: heart and count both derive from this, on every copy of the post.
    const seq = beginEngagement('like', post.id, nextLiked, post.is_liked)
    startTransition(async () => {
      let undoTo: boolean | undefined
      let refusal: string | undefined // the server's own words, e.g. "Your account is suspended until..."
      try {
        // Ask for the state the person wants, not a blind flip: a double tap, a
        // stale screen or a second device can no longer bounce the like back.
        const r = await toggleLikeAction(post.id, nextLiked)
        if ('error' in r) {
          undoTo = !nextLiked
          if ((r as { code?: string }).code === 'suspended') refusal = r.error
        }
      } catch {
        undoTo = !nextLiked // network/server failure: never leave a phantom like
      }
      endEngagement('like', post.id, seq, undoTo)
      if (undoTo !== undefined) toastError(refusal ?? t('post.update_failed'))
    })
  }

  function handleRepost(e?: React.MouseEvent) {
    e?.stopPropagation()
    const nextReposted = !reposted
    setShowRepostMenu(false)
    const seq = beginEngagement('repost', rt.id, nextReposted, rt.is_reposted ?? false)
    startTransition(async () => {
      let undoTo: boolean | undefined
      let refusal: string | undefined
      try {
        const r = await toggleRepostAction(rt.id, nextReposted)
        if ('error' in r) {
          undoTo = !nextReposted
          if ((r as { code?: string }).code === 'suspended') refusal = r.error
        }
        else if (nextReposted && 'post' in r && r.post) publishFeedEvent({ type: 'repost-added', post: r.post })
        else if (!nextReposted) publishFeedEvent({ type: 'repost-removed', originalId: rt.id })
      } catch {
        undoTo = !nextReposted
      }
      endEngagement('repost', rt.id, seq, undoTo)
      if (undoTo !== undefined) toastError(refusal ?? t('post.repost_failed'))
      else success(nextReposted ? t('post.reposted') : t('post.repost_removed'))
    })
  }



  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: align === 'center' ? 'center' : 'flex-start', gap: 4, marginTop: 8, marginLeft: flush ? -10 : 0 }}>
        <div>
          <ActionBtn
            icon={<MessageCircle size={18} />}
            count={post.comments_count}
            active={false} activeColor="#378ADD" onDark={onDark}
            onClick={e => {
              e.stopPropagation()
              if (onReplyClick) onReplyClick()
              else router.push(`/post/${post.id}`)
            }}
            label={t('post.reply')}
          />
        </div>

        <div>
          <ActionBtn
            icon={<RefreshCw size={17} strokeWidth={reposted && !repostTarget ? 2.6 : 2} />} count={repostCount}
            active={repostTarget ? false : reposted} activeColor={REPOST_GREEN} onDark={onDark}
            onClick={e => { e.stopPropagation(); setShowRepostMenu(true) }}
            label={t('post.repost')}
          />
        </div>

        <div>
          <ActionBtn
            icon={<Heart size={18} fill={liked ? LIKE_RED : 'none'} />}
            count={likeCount} active={liked} activeColor={LIKE_RED} onDark={onDark}
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
              active={false} activeColor="var(--color-brand)" onDark={onDark}
              onClick={e => { e.stopPropagation(); router.push(`/post/${post.id}/activity`) }}
              label={t('post.impressions')}
            />
          </div>
        )}

        {/* Escrow pay button - only shown when the author explicitly marked
            this post as selling something (post.is_selling), set via the
            composer toggle. See lib/actions/escrow.ts for the payment +
            hold logic, and post-modal.tsx for where the toggle lives. */}
        {/* Not in the media viewer's footer, which carries just the four action buttons. */}
        {!onDark && !isOwnPost && post.author?.username && post.is_selling && (
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

      <BottomDrawer
        open={showRepostMenu} onClose={() => setShowRepostMenu(false)} title={t('post.repost_options')}
        backdrop={drawerBackdrop} onHeight={onDrawerHeight}
      >
        <DrawerGroup>
          <DrawerItem
            label={t('post.quote')}
            icon={<Quote size={22} />}
            onClick={() => { setShowRepostMenu(false); setShowQuoteModal(true) }}
          />
        </DrawerGroup>
        <DrawerGroup>
          <DrawerItem
            label={reposted ? t('post.undo_repost') : t('post.repost_only')}
            icon={<RefreshCw size={21} />}
            onClick={() => handleRepost()}
          />
        </DrawerGroup>
      </BottomDrawer>

      {showQuoteModal && <QuoteModal post={rt} currentUserId={currentUserId} onClose={() => setShowQuoteModal(false)} />}
    </>
  )
}