// src/components/explore/user-card.tsx
import Link from 'next/link'
import { BadgeCheck, Star, ArrowUpRight } from 'lucide-react'
import { formatNumber } from '@/lib/utils'
import SidebarFollowBtn from '@/components/layout/sidebar-follow-btn'

export interface UserResult {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  verification_tier: string
  followers_count: number
  bio: string | null
  is_monetised: boolean
}

const AVATAR_COLORS = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A6A1A', '#1A6A6A']
export function avatarBg(s: string) {
  return AVATAR_COLORS[s.charCodeAt(0) % AVATAR_COLORS.length]
}

export function UserCard({
  u, showFollow = false, initialFollowing = false, followsMe = false,
}: {
  u: UserResult
  /** Show a real Follow/Unfollow button instead of a "View" link. */
  showFollow?: boolean
  initialFollowing?: boolean
  followsMe?: boolean
}) {
  const initials = u.display_name?.slice(0, 2).toUpperCase() || 'SP'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
      <Link href={`/user/${u.username}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
        <div style={{
          width: 46, height: 46, borderRadius: '50%',
          background: u.avatar_url ? 'transparent' : avatarBg(u.username),
          flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 16, color: 'white', border: '2px solid var(--color-border)',
        }}>
          {u.avatar_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={u.avatar_url} alt={u.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initials}
        </div>
      </Link>
      <Link href={`/user/${u.username}`} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>{u.display_name}</span>
          {u.verification_tier && u.verification_tier !== 'none' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: u.verification_tier === 'organisation' ? '#D4A017' : 'var(--color-brand)' }}>
              <BadgeCheck size={11} color="white" />
            </span>
          )}
          {u.is_monetised && <Star size={12} fill="var(--color-gold)" stroke="none" />}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 1 }}>@{u.username} · {formatNumber(u.followers_count)} followers</div>
        {u.bio && (
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {u.bio}
          </p>
        )}
      </Link>
      {showFollow ? (
        <SidebarFollowBtn targetUserId={u.id} initialFollowing={initialFollowing} followsMe={followsMe} />
      ) : (
        <Link href={`/user/${u.username}`} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--color-brand)', fontWeight: 700, flexShrink: 0, textDecoration: 'none' }}>
          View <ArrowUpRight size={12} />
        </Link>
      )}
    </div>
  )
}