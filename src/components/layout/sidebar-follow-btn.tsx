// src/components/layout/sidebar-follow-btn.tsx
'use client'

import { useState } from 'react'
import { UserPlus, UserCheck, UserMinus } from 'lucide-react'
import { useEngagement, setEngagement } from '@/lib/engagement-sync'
import { useTranslation } from '@/lib/i18n/language-context'

export default function SidebarFollowBtn({
  targetUserId,
  initialFollowing = false,
  followsMe = false,
}: {
  targetUserId: string
  initialFollowing?: boolean
  followsMe?: boolean
}) {
  const { t } = useTranslation()
  // Saved instantly and delivered in the background (retried on a weak
  // connection) - see engagement-sync.
  const { active: following } = useEngagement('follow', targetUserId, initialFollowing)
  const [hovered,   setHovered]   = useState(false)

  function handleClick() {
    setEngagement('follow', targetUserId, !following)
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
    label  = isFollowBack ? t('profile.follow_back') : t('profile.follow')
    icon   = <UserPlus size={13} />
  } else if (hovered) {
    bg     = 'var(--color-error-muted, #2a0a0a)'
    border = 'var(--color-error)'
    color  = 'var(--color-error)'
    label  = t('profile.unfollow')
    icon   = <UserMinus size={13} />
  } else {
    bg     = 'transparent'
    border = 'var(--color-border)'
    color  = 'var(--color-text-secondary)'
    label  = t('feed.following')
    icon   = <UserCheck size={13} />
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        padding: '0 14px', height: 34, borderRadius: 24,
        border: `1.5px solid ${border}`,
        background: bg, color,
        fontSize: 13, fontWeight: 700,
        cursor: 'pointer',
        fontFamily: "'Syne', sans-serif",
        transition: 'all 0.15s',
        whiteSpace: 'nowrap', flexShrink: 0,
        minWidth: 96,
      }}
    >
      {icon}{label}
    </button>
  )
}