// src/components/feed/post-follow-button.tsx
'use client'

// "Follow" / "Follow back" pill for the top row of a post on its detail page.
//
//   - you don't follow them                      -> "Follow"
//   - they follow you and you haven't followed    -> "Follow back"
//   - you already follow them                     -> nothing at all
//
// Tapping it follows straight away (same instant, retried-in-the-background
// follow the rest of the app uses) and the pill disappears, because once you
// follow there is nothing left to offer here. If the follow is refused (blocked,
// suspended, no connection for too long) the state is rolled back and it comes
// back. Compact on purpose: it has to share one line with the name, @handle,
// time and the more button on a phone.

import { useEngagement, setEngagement } from '@/lib/engagement-sync'
import { useTranslation } from '@/lib/i18n/language-context'

export default function PostFollowButton({
  targetUserId,
  followsMe,
}: {
  targetUserId: string
  followsMe: boolean
}) {
  const { t } = useTranslation()
  const { active: following } = useEngagement('follow', targetUserId, false)

  if (following) return null

  return (
    <button
      onClick={e => { e.stopPropagation(); setEngagement('follow', targetUserId, true) }}
      style={{
        flexShrink: 0, height: 28, padding: '0 12px', borderRadius: 14,
        border: 'none', background: 'var(--color-brand)', color: '#fff',
        fontSize: 12.5, fontWeight: 700, fontFamily: "'Syne', sans-serif",
        cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {followsMe ? t('profile.follow_back') : t('profile.follow')}
    </button>
  )
}
