'use client'

// src/components/layout/sidebar-follow-btn.tsx
// Thin client component so the sidebar stays a server component
// but the Follow button has interactive state.

import { useState, useTransition } from 'react'
import { toggleFollowAction } from '@/lib/actions'

export default function SidebarFollowBtn({ targetUserId }: { targetUserId: string }) {
  const [following, setFollowing] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await toggleFollowAction(targetUserId)
      if ('following' in result && typeof result.following === 'boolean') {
        setFollowing(result.following)
      }
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      style={{
        padding: '5px 13px',
        borderRadius: 20,
        border: following ? '1px solid var(--color-border)' : '1px solid var(--color-brand)',
        background: following ? 'var(--color-surface-2)' : 'transparent',
        color: following ? 'var(--color-text-muted)' : 'var(--color-brand)',
        fontSize: 12, fontWeight: 700,
        cursor: isPending ? 'not-allowed' : 'pointer',
        fontFamily: "'Syne', sans-serif",
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
        opacity: isPending ? 0.6 : 1,
      }}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  )
}