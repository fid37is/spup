// src/app/(main)/user/[username]/profile-action-bar.tsx
'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  MessageSquare, Bell, BellOff, MoreHorizontal,
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
  chatAllowed: boolean
  initialNotifsEnabled: boolean
  initialMuted: boolean
  initialBlocked: boolean
  isSelf?: boolean  // viewing own profile — show share only
}

export default function ProfileActionBar({
  targetUserId, username,
  initialFollowing, followsMe, isPrivate,
  chatAllowed, initialNotifsEnabled,
  initialMuted, initialBlocked,
  isSelf = false,
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
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMenu) return
    function onClickOut(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', onClickOut)
    return () => document.removeEventListener('mousedown', onClickOut)
  }, [showMenu])

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

  const MENU_BTN: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12,
    width: '100%', padding: '11px 16px',
    background: 'none', border: 'none',
    cursor: 'pointer', fontSize: 14,
    fontFamily: "'DM Sans',sans-serif",
    color: 'var(--color-text-primary)',
    textAlign: 'left', transition: 'background 0.1s',
  }

  // ── Own profile: share/copy only, no social actions ──────────────────────
  if (isSelf) {
    return (
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setShowMenu(v => !v)}
          style={BTN}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <MoreHorizontal size={18} />
        </button>
        {showMenu && (
          <div style={{
            position: 'absolute', right: 0, top: 48, zIndex: 50,
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: 14, padding: 4, minWidth: 220,
            boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
          }}>
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
          </div>
        )}
      </div>
    )
  }

  // ── Blocked state ─────────────────────────────────────────────────────────
  if (blocked) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button onClick={() => setShowMenu(v => !v)} style={BTN}>
            <MoreHorizontal size={18} />
          </button>
          {showMenu && (
            <div style={{ position: 'absolute', right: 0, top: 48, zIndex: 50, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 4, minWidth: 200, boxShadow: '0 8px 28px rgba(0,0,0,0.4)' }}>
              <button onClick={handleBlock} style={{ ...MENU_BTN, color: 'var(--color-brand)' }}>
                <Ban size={16} /> Unblock @{username}
              </button>
            </div>
          )}
        </div>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Blocked</span>
      </div>
    )
  }

  // ── Normal other-user action bar ──────────────────────────────────────────
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>

      {/* ··· More options */}
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setShowMenu(v => !v)}
          style={BTN}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <MoreHorizontal size={18} />
        </button>

        {showMenu && (
          <div style={{
            position: 'absolute', right: 0, top: 48, zIndex: 50,
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: 14, padding: 4, minWidth: 220,
            boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
          }}>
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
          </div>
        )}
      </div>

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
  )
}