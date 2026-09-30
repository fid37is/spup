// src/components/explore/user-card.tsx
import Link from 'next/link'
import { Star, ArrowUpRight } from 'lucide-react'
import { formatNumber } from '@/lib/utils'
import SidebarFollowBtn from '@/components/layout/sidebar-follow-btn'
import VerifiedBadge from '@/components/ui/verified-badge'

export interface UserResult {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  verification_tier: string
  followers_count: number
  bio: string | null
  is_monetised: boolean
}

const AVATAR_COLORS = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A6A1A', '#1A6A6A']

/** Null-safe: never call charCodeAt on null/undefined/empty. */
export function avatarBg(s: string | null | undefined) {
  if (!s) return AVATAR_COLORS[0]
  return AVATAR_COLORS[s.charCodeAt(0) % AVATAR_COLORS.length]
}

export function UserCard({
  u, showFollow = false, initialFollowing = false, followsMe = false,
}: {
  u: UserResult
  showFollow?: boolean
  initialFollowing?: boolean
  followsMe?: boolean
}) {
  // Skip non-public accounts if they slip past queries
  if (!u.username) return null

  const initials =
    u.display_name?.slice(0, 2).toUpperCase() ||
    u.username.slice(0, 2).toUpperCase() ||
    'SP'
  const profileHref = `/user/${u.username}`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
      <Link href={profileHref} style={{ textDecoration: 'none', flexShrink: 0 }}>
        <div style={{
          width: 46, height: 46, borderRadius: '50%',
          background: u.avatar_url
            ? 'transparent'
            : avatarBg(u.username ?? u.display_name),
          flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 16, color: 'white', border: '2px solid var(--color-border)',
        }}>
          {u.avatar_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={u.avatar_url} alt={u.display_name ?? u.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initials}
        </div>
      </Link>
      <Link href={profileHref} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {u.display_name || u.username}
          </span>
          {u.verification_tier && u.verification_tier !== 'none' && (
            <VerifiedBadge tier={u.verification_tier} size={15} />
          )}
          {u.is_monetised && <Star size={12} fill="var(--color-gold)" stroke="none" />}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 1 }}>
          @{u.username} · {formatNumber(u.followers_count)} followers
        </div>
        {u.bio && (
          <p style={{
            fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0',
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {u.bio}
          </p>
        )}
      </Link>
      {showFollow ? (
        <SidebarFollowBtn targetUserId={u.id} initialFollowing={initialFollowing} followsMe={followsMe} />
      ) : (
        <Link href={profileHref} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--color-brand)', fontWeight: 700, flexShrink: 0, textDecoration: 'none' }}>
          View <ArrowUpRight size={12} />
        </Link>
      )}
    </div>
  )
}