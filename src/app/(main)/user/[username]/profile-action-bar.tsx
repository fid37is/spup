// src/app/(main)/user/[username]/profile-action-bar.tsx
'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  MessageSquare, Bell, BellOff, MoreVertical,
  UserCheck, UserMinus, UserPlus,
  VolumeX, Volume2, Ban, Flag, Link2, Share2,
} from 'lucide-react'
import {
  toggleFollowAction,
  toggleBlockAction,
  toggleMuteAction,
  togglePostNotificationsAction,
} from '@/lib/actions/follows'
import { getOrCreateConversationAction } from '@/lib/actions/messages'
import { useToast } from '@/components/layout/toast'

interface ProfileActionBarProps {
  targetUserId: string
  username: string
  initialFollowing: boolean
  followsMe: boolean
  isPrivate: boolean
  chatAllowed: boolean        // profile.chat_visibility === 'everyone' or is following
  initialNotifsEnabled: boolean
  initialMuted: boolean
  initialBlocked: boolean
  // Passed by ProfileHeader (via React.cloneElement) so the "···" more-options
  // button can be portaled onto the banner — next to the back button — instead
  // of sitting inline in the button row below the avatar. That's what frees up
  // enough width for Chat / Notifications / Follow to stay on one line next to
  // the avatar on narrow phones, instead of the whole row wrapping underneath it.
  moreSlotRef?: React.RefObject<HTMLDivElement | null>
}

export default function ProfileActionBar({
  targetUserId, username,
  initialFollowing, followsMe, isPrivate,
  chatAllowed, initialNotifsEnabled,
  initialMuted, initialBlocked,
  moreSlotRef,
}: ProfileActionBarProps) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const [, startT] = useTransition()

  const [following,  setFollowing]  = useState(initialFollowing)
  const [hovering,   setHovering]   = useState(false)
  const [notifs,     setNotifs]     = useState(initialNotifsEnabled)
  const [muted,      setMuted]      = useState(initialMuted)
  const [blocked,    setBlocked]    = useState(initialBlocked)
  const [showMenu,   setShowMenu]   = useState(false)
  // Position of the dropdown itself, computed from the trigger button's
  // actual on-screen location and rendered via a fixed-position portal to
  // document.body (see openMenu below for why — the trigger button lives
  // inside the banner, which clips overflow to crop the cover photo, so a
  // menu nested/anchored inside it gets clipped or spills out oddly instead
  // of appearing as a normal floating dropdown).
  const [menuPos,    setMenuPos]    = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // The moreSlotRef target (a div ProfileHeader renders on the banner) mounts
  // in the same commit as this component, but its ref isn't populated until
  // after that commit — so we re-render once on mount to pick it up.
  const [slotReady, setSlotReady] = useState(false)
  useEffect(() => { if (moreSlotRef?.current) setSlotReady(true) }, [moreSlotRef])

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setMenuPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) })
    setShowMenu(true)
  }

  function handleFollow() {
    const next = !following
    setFollowing(next)
    setHovering(false)
    startT(async () => {
      const r = await toggleFollowAction(targetUserId)
      if ('error' in r) { setFollowing(!next); toastError((r as any).error) }
    })
  }

  function handleNotif() {
    const next = !notifs
    setNotifs(next)
    startT(async () => {
      const r = await togglePostNotificationsAction(targetUserId)
      if ('error' in r) { setNotifs(!next); toastError((r as any).error); return }
      success(r.enabled ? `You'll be notified of @${username}'s posts` : 'Post notifications off')
    })
  }

  function handleMute() {
    setShowMenu(false)
    const next = !muted
    setMuted(next)
    startT(async () => {
      const r = await toggleMuteAction(targetUserId)
      if ('error' in r) { setMuted(!next); toastError((r as any).error); return }
      success(next ? `@${username} muted` : `@${username} unmuted`)
    })
  }

  function handleBlock() {
    setShowMenu(false)
    const next = !blocked
    setBlocked(next)
    if (next) setFollowing(false)
    startT(async () => {
      const r = await toggleBlockAction(targetUserId)
      if ('error' in r) { setBlocked(!next); toastError((r as any).error); return }
      success(next ? `@${username} blocked` : `@${username} unblocked`)
    })
  }

  function handleCopyLink() {
    setShowMenu(false)
    navigator.clipboard.writeText(`${window.location.origin}/user/${username}`)
    success('Profile link copied')
  }

  async function handleShare() {
    setShowMenu(false)
    const url = `${window.location.origin}/user/${username}`
    if (navigator.share) {
      await navigator.share({ title: `@${username} on Spup`, url })
    } else {
      navigator.clipboard.writeText(url)
      success('Profile link copied')
    }
  }

  const BTN: React.CSSProperties = {
    width: 42, height: 42, borderRadius: '50%',
    border: '1px solid var(--color-border)',
    background: 'none', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: 'var(--color-text-primary)',
    transition: 'background 0.12s',
    flexShrink: 0,
  }

  // Floating variant sits on the banner image itself (like the back button),
  // so it needs a dark scrim background + white icon rather than the bordered
  // surface-colored circle used inline.
  const FLOATING_BTN: React.CSSProperties = {
    width: 36, height: 36, borderRadius: '50%',
    background: 'rgba(0,0,0,0.45)', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: 'white',
    WebkitTapHighlightColor: 'transparent',
  }

  const MENU_BTN: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12,
    width: '100%', padding: '11px 16px',
    background: 'none', border: 'none',
    cursor: 'pointer', fontSize: 14,
    fontFamily: "'DM Sans',sans-serif",
    color: 'var(--color-text-primary)',
    textAlign: 'left', transition: 'background 0.1s',
  }

  // ── "···" trigger button ───────────────────────────────────────────────────
  // Portaled onto the banner (right side, mirroring the back button on the
  // left) when moreSlotRef is available; falls back to rendering inline
  // otherwise so this component still works standalone if ever reused
  // without a banner slot.
  const triggerButton = (
    <button
      ref={triggerRef}
      onClick={() => (showMenu ? setShowMenu(false) : openMenu())}
      style={moreSlotRef ? FLOATING_BTN : BTN}
      aria-label="More options"
      onMouseEnter={e => { if (!moreSlotRef) e.currentTarget.style.background = 'var(--color-surface-2)' }}
      onMouseLeave={e => { if (!moreSlotRef) e.currentTarget.style.background = 'none' }}
    >
      <MoreVertical size={18} />
    </button>
  )

  const triggerRendered = moreSlotRef
    ? (slotReady && moreSlotRef.current && createPortal(triggerButton, moreSlotRef.current))
    : triggerButton

  // ── Dropdown ────────────────────────────────────────────────────────────
  // Always portaled to document.body with fixed positioning computed from
  // the trigger's own on-screen rect (see openMenu above). The trigger sits
  // inside the banner, which has `overflow: hidden` to crop the cover photo
  // — a menu nested or anchored inside that box gets clipped or spills out
  // in the wrong place instead of behaving like a normal floating dropdown,
  // so the menu itself needs to live entirely outside that DOM subtree.
  const menuRendered = showMenu && menuPos && createPortal(
    <>
      <div onClick={() => setShowMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 499 }} />
      <div
        ref={menuRef}
        style={{
          position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 500,
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: 14, padding: 4, minWidth: 220,
          maxWidth: 'min(240px, calc(100vw - 16px))',
          boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
        }}
      >
        {blocked ? (
          <button onClick={handleBlock} style={{ ...MENU_BTN, color: 'var(--color-brand)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            <Ban size={16} /> Unblock @{username}
          </button>
        ) : (
          <>
            <button onClick={handleShare} style={MENU_BTN}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <Share2 size={16} /> Share @{username}
            </button>
            <button onClick={handleCopyLink} style={MENU_BTN}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <Link2 size={16} /> Copy link to profile
            </button>
            <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 0' }} />
            <button onClick={handleMute} style={{ ...MENU_BTN, color: muted ? 'var(--color-brand)' : 'var(--color-text-primary)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              {muted ? <Volume2 size={16} /> : <VolumeX size={16} />}
              {muted ? `Unmute @${username}` : `Mute @${username}`}
            </button>
            <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 0' }} />
            <button onClick={handleBlock} style={{ ...MENU_BTN, color: 'var(--color-error)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <Ban size={16} /> Block @{username}
            </button>
            <button onClick={() => { setShowMenu(false); toastError('Report submitted. Thank you.') }}
              style={{ ...MENU_BTN, color: 'var(--color-error)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <Flag size={16} /> Report @{username}
            </button>
          </>
        )}
      </div>
    </>,
    document.body
  )

  const moreButtonRendered = <>{triggerRendered}{menuRendered}</>

  if (blocked) {
    return (
      <>
        {moreButtonRendered}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Blocked</span>
        </div>
      </>
    )
  }

  return (
    <>
      {moreButtonRendered}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', rowGap: 8 }}>

        {/* Chat */}
        {chatAllowed && (
          <button
            onClick={() => {
              void (async () => {
                const r = await getOrCreateConversationAction(targetUserId)
                if ('conversationId' in r) router.push(`/messages/${r.conversationId}`)
                else toastError('Could not open chat')
              })()
            }}
            style={BTN}
            title={`Message @${username}`}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <MessageSquare size={18} />
          </button>
        )}

        {/* Post notifications — only when following */}
        {following && (
          <button
            onClick={handleNotif}
            style={{ ...BTN, color: notifs ? 'var(--color-brand)' : 'var(--color-text-primary)', borderColor: notifs ? 'var(--color-brand)' : 'var(--color-border)' }}
            title={notifs ? 'Turn off post notifications' : 'Turn on post notifications'}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            {notifs ? <Bell size={18} /> : <BellOff size={18} />}
          </button>
        )}

        {/* Follow / Following / Follow back */}
        <button
          onClick={handleFollow}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: following
              ? (hovering ? 'var(--color-error-muted, #2a0a0a)' : 'transparent')
              : 'var(--color-brand)',
            border: following
              ? `1px solid ${hovering ? 'var(--color-error)' : 'var(--color-border)'}`
              : 'none',
            borderRadius: 20, padding: '9px 20px',
            color: following ? (hovering ? 'var(--color-error)' : 'var(--color-text-secondary)') : 'white',
            fontSize: 14, fontWeight: 700,
            fontFamily: "'Syne', sans-serif",
            cursor: 'pointer', transition: 'all 0.15s',
            minWidth: following ? 110 : 'auto',
          }}
        >
          {following
            ? (hovering ? <><UserMinus size={15} /> Unfollow</> : <><UserCheck size={15} /> Following</>)
            : <><UserPlus size={15} />{!following && followsMe ? 'Follow back' : 'Follow'}</>
          }
        </button>
      </div>
    </>
  )
}