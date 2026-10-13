'use client'

// One person in the "Liked by" list. The whole row opens their profile -
// except your own row, which does nothing. The Follow / Follow back button
// works on its own and never triggers the row.

import { useRouter } from 'next/navigation'
import SidebarFollowBtn from '@/components/layout/sidebar-follow-btn'
import { formatNumber } from '@/lib/utils'

interface Props {
  user: {
    id: string
    username: string | null
    display_name: string | null
    avatar_url: string | null
    followers_count: number | null
    is_following: boolean
    follows_me: boolean
  }
  isSelf: boolean
  /** Quotes page: the quote text shown under the person. */
  body?: string | null
}

export default function LikerRow({ user, isSelf, body }: Props) {
  const router = useRouter()
  const name = user.display_name || user.username || 'Spup user'
  const canOpen = !isSelf && !!user.username
  const open = () => { if (canOpen) router.push(`/user/${user.username}`) }

  return (
    <div
      role={canOpen ? 'link' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      onClick={canOpen ? open : undefined}
      onKeyDown={canOpen ? e => { if (e.key === 'Enter') open() } : undefined}
      style={{
        borderBottom: '1px solid var(--color-border)',
        cursor: canOpen ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: body ? '12px 20px 4px' : '12px 20px' }}>
      {user.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatar_url} alt={name} width={44} height={44} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 17, fontWeight: 700, fontFamily: "'Syne',sans-serif",
        }}>
          {name.slice(0, 2).toUpperCase()}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.username ?? name}
        </div>
        {user.display_name && user.username && (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.display_name}
          </div>
        )}
        {!!user.followers_count && user.followers_count > 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 2 }}>
            {formatNumber(user.followers_count)} followers
          </div>
        )}
      </div>

      {!isSelf && (
        <div onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
          <SidebarFollowBtn targetUserId={user.id} initialFollowing={user.is_following} followsMe={user.follows_me} />
        </div>
      )}
      </div>
      {body && (
        <p style={{ padding: '4px 20px 14px 76px', fontSize: 14, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5, wordBreak: 'break-word' }}>
          {body}
        </p>
      )}
    </div>
  )
}