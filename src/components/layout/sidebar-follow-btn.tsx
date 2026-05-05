// src/components/layout/sidebar-follow-btn.tsx
'use client'

import { useState, useTransition } from 'react'
import { UserPlus, UserCheck, UserMinus, Loader2 } from 'lucide-react'
import { toggleFollowAction } from '@/lib/actions'

export default function SidebarFollowBtn({
  targetUserId,
  initialFollowing = false,
  followsMe = false,
}: {
  targetUserId: string
  initialFollowing?: boolean
  followsMe?: boolean
}) {
  const [following, setFollowing] = useState(initialFollowing)
  const [hovered,   setHovered]   = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    const next = !following
    setFollowing(next)
    startTransition(async () => {
      const result = await toggleFollowAction(targetUserId)
      if ('error' in result) setFollowing(!next)
    })
  }

  // States:
  // not following + they follow me  → "Follow back" (brand bg)
  // not following                   → "Follow" (white bg)
  // following + hovering            → "Unfollow" (red)
  // following                       → "Following" (outlined)

  let bg: string, border: string, color: string, label: string, icon: React.ReactNode

  if (!following) {
    const isFollowBack = followsMe
    bg     = 'var(--color-brand)'
    border = 'transparent'
    color  = 'white'
    label  = isFollowBack ? 'Follow back' : 'Follow'
    icon   = <UserPlus size={13} />
  } else if (hovered) {
    bg     = 'var(--color-error-muted, #2a0a0a)'
    border = 'var(--color-error)'
    color  = 'var(--color-error)'
    label  = 'Unfollow'
    icon   = <UserMinus size={13} />
  } else {
    bg     = 'transparent'
    border = 'var(--color-border)'
    color  = 'var(--color-text-secondary)'
    label  = 'Following'
    icon   = <UserCheck size={13} />
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={isPending}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        padding: '0 14px', height: 34, borderRadius: 24,
        border: `1.5px solid ${border}`,
        background: bg, color,
        fontSize: 13, fontWeight: 700,
        cursor: isPending ? 'default' : 'pointer',
        fontFamily: "'Syne', sans-serif",
        transition: 'all 0.15s',
        whiteSpace: 'nowrap', flexShrink: 0,
        minWidth: 96, opacity: isPending ? 0.7 : 1,
      }}
    >
      {isPending
        ? <Loader2 size={13} style={{ animation: 'spin 0.65s linear infinite' }} />
        : <>{icon}{label}</>
      }
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </button>
  )
}