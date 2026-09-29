// src/app/(main)/user/[username]/follow-button.tsx
'use client'

import { useState } from 'react'
import { useEngagement, setEngagement } from '@/lib/engagement-sync'
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
  // Saved instantly and delivered in the background (retried on a weak
  // connection) - see engagement-sync.
  const { active: following } = useEngagement('follow', targetUserId, initialFollowing)
  const [hovering, setHovering] = useState(false)

  // Label logic:
  // - Not following + they follow me → "Follow back"
  // - Not following → "Follow"
  // - Following + hovering → "Unfollow"
  // - Following → "Following"
  const isFollowBack = !following && followsMe

  function handleClick() {
    setHovering(false)
    setEngagement('follow', targetUserId, !following)
  }

  if (!following) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <button
          onClick={handleClick}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: isFollowBack ? 'var(--color-brand)' : 'var(--color-brand)',
            border: 'none', borderRadius: 20, padding: '9px 20px',
            cursor: 'pointer',
            color: 'white', fontSize: 14, fontWeight: 700,
            fontFamily: "'Syne', sans-serif",
            transition: 'opacity 0.15s, background 0.15s',
          }}
        >
          <UserPlus size={15} />
          {isFollowBack ? 'Follow back' : 'Follow'}
        </button>
      </div>
    )
  }

  // Following state — show "Unfollow" on hover
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        onClick={handleClick}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: hovering ? 'var(--color-error-muted, #2a0a0a)' : 'transparent',
          border: `1px solid ${hovering ? 'var(--color-error)' : 'var(--color-border)'}`,
          borderRadius: 20, padding: '9px 20px',
          cursor: 'pointer',
          color: hovering ? 'var(--color-error)' : 'var(--color-text-secondary)',
          fontSize: 14, fontWeight: 700,
          fontFamily: "'Syne', sans-serif",
          transition: 'all 0.15s',
          minWidth: 110,
        }}
      >
        {hovering
          ? <><UserMinus size={15} /> Unfollow</>
          : <><UserCheck size={15} /> Following</>
        }
      </button>
    </div>
  )
}