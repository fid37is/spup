// src/app/(main)/user/[username]/follow-button.tsx
'use client'

import { useState, useTransition } from 'react'
import { toggleFollowAction } from '@/lib/actions'
import { UserPlus, UserCheck, Clock } from 'lucide-react'

interface FollowButtonProps {
  targetUserId: string
  initialFollowing: boolean
  isPrivate: boolean
}

export default function FollowButton({ targetUserId, initialFollowing, isPrivate }: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing)
  const [requested, setRequested] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (isPrivate && !following) {
      // Private account — show "Requested" state (follow request flow)
      setRequested(true)
      return
    }

    const next = !following
    setFollowing(next)

    startTransition(async () => {
      const result = await toggleFollowAction(targetUserId)
      if ('error' in result) {
        setFollowing(!next)  // revert on error
      }
    })
  }

  if (requested) {
    return (
      <button
        onClick={() => setRequested(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: 'transparent', border: '1px solid #2A2A30',
          borderRadius: 20, padding: '9px 18px', cursor: 'pointer',
          color: '#8A8A85', fontSize: 14, fontWeight: 600,
          fontFamily: "'Syne', sans-serif",
        }}
      >
        <Clock size={15} /> Requested
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        background: following ? 'transparent' : '#1A9E5F',
        border: following ? '1px solid #2A2A30' : 'none',
        borderRadius: 20, padding: '9px 20px', cursor: 'pointer',
        color: following ? '#8A8A85' : 'white',
        fontSize: 14, fontWeight: 700,
        fontFamily: "'Syne', sans-serif",
        transition: 'background 0.15s, color 0.15s',
        opacity: isPending ? 0.7 : 1,
      }}
    >
      {following
        ? <><UserCheck size={15} /> Following</>
        : <><UserPlus size={15} /> Follow</>
      }
    </button>
  )
}