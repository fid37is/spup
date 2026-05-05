// src/app/(main)/user/[username]/follow-button.tsx
'use client'

import { useState, useTransition } from 'react'
import { toggleFollowAction } from '@/lib/actions'
import { UserPlus, UserCheck, UserMinus } from 'lucide-react'

interface FollowButtonProps {
  targetUserId: string
  initialFollowing: boolean
  followsMe: boolean        // does this person follow the viewer back?
  isPrivate: boolean
}

export default function FollowButton({
  targetUserId,
  initialFollowing,
  followsMe,
  isPrivate,
}: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing)
  const [hovering, setHovering] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  // Label logic:
  // - Not following + they follow me → "Follow back"
  // - Not following → "Follow"
  // - Following + hovering → "Unfollow"
  // - Following → "Following"
  const isFollowBack = !following && followsMe

  function handleClick() {
    const next = !following
    setError('')
    setFollowing(next)
    setHovering(false)

    startTransition(async () => {
      const result = await toggleFollowAction(targetUserId)
      if ('error' in result) {
        setFollowing(!next) // revert
        setError(result.error ?? 'Something went wrong')
      }
    })
  }

  if (!following) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <button
          onClick={handleClick}
          disabled={isPending}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: isFollowBack ? 'var(--color-brand)' : 'var(--color-brand)',
            border: 'none', borderRadius: 20, padding: '9px 20px',
            cursor: isPending ? 'default' : 'pointer',
            color: 'white', fontSize: 14, fontWeight: 700,
            fontFamily: "'Syne', sans-serif",
            opacity: isPending ? 0.7 : 1,
            transition: 'opacity 0.15s, background 0.15s',
          }}
        >
          <UserPlus size={15} />
          {isFollowBack ? 'Follow back' : 'Follow'}
        </button>
        {error && (
          <span style={{ fontSize: 12, color: 'var(--color-error)', fontFamily: "'DM Sans', sans-serif" }}>
            {error}
          </span>
        )}
      </div>
    )
  }

  // Following state — show "Unfollow" on hover
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        onClick={handleClick}
        disabled={isPending}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: hovering ? 'var(--color-error-muted, #2a0a0a)' : 'transparent',
          border: `1px solid ${hovering ? 'var(--color-error)' : 'var(--color-border)'}`,
          borderRadius: 20, padding: '9px 20px',
          cursor: isPending ? 'default' : 'pointer',
          color: hovering ? 'var(--color-error)' : 'var(--color-text-secondary)',
          fontSize: 14, fontWeight: 700,
          fontFamily: "'Syne', sans-serif",
          opacity: isPending ? 0.7 : 1,
          transition: 'all 0.15s',
          minWidth: 110,
        }}
      >
        {hovering
          ? <><UserMinus size={15} /> Unfollow</>
          : <><UserCheck size={15} /> Following</>
        }
      </button>
      {error && (
        <span style={{ fontSize: 12, color: 'var(--color-error)', fontFamily: "'DM Sans', sans-serif" }}>
          {error}
        </span>
      )}
    </div>
  )
}