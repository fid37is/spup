'use client'

import { useState, useTransition, useEffect } from 'react'
import { toggleFollowAction } from '@/lib/actions'
import { Loader2 } from 'lucide-react'

// Inject the spinner keyframe once per page, not once per button instance
if (typeof document !== 'undefined' && !document.getElementById('__sb-spin-style')) {
  const s = document.createElement('style')
  s.id = '__sb-spin-style'
  s.textContent = '@keyframes _spin { to { transform: rotate(360deg); } } .sb-spin { animation: _spin 0.65s linear infinite; display: block; }'
  document.head.appendChild(s)
}

export default function SidebarFollowBtn({
  targetUserId,
  initialFollowing = false,
}: {
  targetUserId: string
  initialFollowing?: boolean
}) {
  const [following, setFollowing] = useState(initialFollowing)
  const [hovered, setHovered] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    const next = !following
    setFollowing(next)
    startTransition(async () => {
      const result = await toggleFollowAction(targetUserId)
      if ('error' in result) setFollowing(!next)
    })
  }

  const isDanger = following && hovered
  const bg    = following ? (isDanger ? 'var(--color-error-muted)'     : 'var(--color-surface-2)')    : 'white'
  const border = following ? (isDanger ? 'var(--color-error)'           : 'var(--color-border)')       : 'transparent'
  const color  = following ? (isDanger ? 'var(--color-error)'           : 'var(--color-text-primary)') : '#000'
  const label  = following ? (isDanger ? 'Unfollow' : 'Following') : 'Follow'

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={isPending}
      style={{
        padding: '0 16px', height: 34, borderRadius: 24,
        border: `1.5px solid ${border}`, background: bg, color,
        fontSize: 14, fontWeight: 700,
        cursor: isPending ? 'default' : 'pointer',
        fontFamily: "'Syne', sans-serif", transition: 'all 0.15s',
        whiteSpace: 'nowrap', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 86, opacity: isPending ? 0.7 : 1,
      }}
    >
      {isPending ? <Loader2 size={14} className="sb-spin" /> : label}
    </button>
  )
}