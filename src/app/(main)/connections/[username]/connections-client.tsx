// src/app/(main)/connections/[username]/connections-client.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserCheck, UserMinus, UserPlus, Loader2, BadgeCheck, Star } from 'lucide-react'
import { toggleFollowAction } from '@/lib/actions'

type Tab = 'following' | 'followers' | 'mutuals'

interface UserRow {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  verification_tier: string
  is_monetised: boolean
  followers_count: number
  bio: string | null
}

interface Props {
  username: string
  initialTab: Tab
  following: UserRow[]
  followers: UserRow[]
  mutuals: UserRow[]
  viewerId: string | null
  viewerFollowingIds: string[]
  viewerFollowerIds: string[]
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'following', label: 'Following' },
  { key: 'followers', label: 'Followers' },
  { key: 'mutuals',   label: 'Mutuals'   },
]

const AVATAR_COLORS = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A1A4A']

function Avatar({ user }: { user: UserRow }) {
  const bg = AVATAR_COLORS[user.display_name.charCodeAt(0) % AVATAR_COLORS.length]
  return (
    <div style={{
      width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
      background: user.avatar_url ? 'transparent' : bg,
      overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17, color: 'white',
    }}>
      {user.avatar_url
        ? <img src={user.avatar_url} alt={user.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : user.display_name.slice(0, 2).toUpperCase()
      }
    </div>
  )
}

// ── Inline follow button ──────────────────────────────────────────────────────
function FollowBtn({
  targetUserId,
  initialFollowing,
  followsMe,
  isOwnProfile,
}: {
  targetUserId: string
  initialFollowing: boolean
  followsMe: boolean
  isOwnProfile: boolean
}) {
  const [following, setFollowing] = useState(initialFollowing)
  const [hovered,   setHovered]   = useState(false)
  const [isPending, startTransition] = useTransition()

  // Don't show a button for own profile entries
  if (isOwnProfile) return null

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    const next = !following
    setFollowing(next)
    startTransition(async () => {
      const result = await toggleFollowAction(targetUserId)
      if ('error' in result) setFollowing(!next)
    })
  }

  let bg: string, border: string, color: string, label: string, icon: React.ReactNode

  if (!following) {
    bg     = 'var(--color-brand)'
    border = 'transparent'
    color  = 'white'
    label  = followsMe ? 'Follow back' : 'Follow'
    icon   = <UserPlus size={13} />
  } else if (hovered) {
    bg     = 'var(--color-error-muted, #2a0a0a)'
    border = 'var(--color-error)'
    color  = 'var(--color-error)'
    label  = 'Unfollow'
    icon   = <UserMinus size={13} />
  } else {
    bg     = 'transparent'
    border = 'var(--color-border)'
    color  = 'var(--color-text-secondary)'
    label  = 'Following'
    icon   = <UserCheck size={13} />
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={isPending}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        padding: '0 14px', height: 34, borderRadius: 24,
        border: `1.5px solid ${border}`,
        background: bg, color,
        fontSize: 13, fontWeight: 700,
        cursor: isPending ? 'default' : 'pointer',
        fontFamily: "'Syne', sans-serif",
        transition: 'all 0.15s',
        whiteSpace: 'nowrap', flexShrink: 0,
        minWidth: 96, opacity: isPending ? 0.7 : 1,
      }}
    >
      {isPending
        ? <Loader2 size={13} style={{ animation: 'spin 0.65s linear infinite' }} />
        : <>{icon}{label}</>
      }
    </button>
  )
}

// ── User card ─────────────────────────────────────────────────────────────────
function UserCard({
  user,
  viewerId,
  viewerFollowingSet,
  viewerFollowerSet,
}: {
  user: UserRow
  viewerId: string | null
  viewerFollowingSet: Set<string>
  viewerFollowerSet: Set<string>
}) {
  const router = useRouter()
  const isOwnProfile = viewerId === user.id
  const viewerFollowsUser = viewerFollowingSet.has(user.id)
  const userFollowsViewer = viewerFollowerSet.has(user.id)

  return (
    <div
      onClick={() => router.push(`/user/${user.username}`)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 20px',
        borderBottom: '1px solid var(--color-border)',
        cursor: 'pointer', transition: 'background 0.1s',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = '' }}
    >
      <Avatar user={user} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Name row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
            color: 'var(--color-text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user.display_name}
          </span>
          {user.verification_tier !== 'none' && (
            <BadgeCheck size={15} color="var(--color-brand)" style={{ flexShrink: 0 }} />
          )}
          {user.is_monetised && (
            <Star size={12} fill="var(--color-gold)" stroke="none" style={{ flexShrink: 0 }} />
          )}
          {/* "Follows you" badge */}
          {!isOwnProfile && userFollowsViewer && (
            <span style={{
              fontSize: 11, padding: '1px 6px', borderRadius: 4,
              background: 'var(--color-surface-3)',
              color: 'var(--color-text-muted)',
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500, flexShrink: 0,
            }}>
              Follows you
            </span>
          )}
        </div>

        {/* Handle + follower count */}
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 1 }}>
          @{user.username}
          {user.followers_count > 0 && (
            <span> · {user.followers_count.toLocaleString()} followers</span>
          )}
        </div>

        {/* Bio */}
        {user.bio && (
          <div style={{
            fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user.bio}
          </div>
        )}
      </div>

      {/* Follow button */}
      {viewerId && (
        <FollowBtn
          targetUserId={user.id}
          initialFollowing={viewerFollowsUser}
          followsMe={userFollowsViewer}
          isOwnProfile={isOwnProfile}
        />
      )}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function Empty({ tab }: { tab: Tab }) {
  const msg: Record<Tab, string> = {
    following: 'Not following anyone yet',
    followers: 'No followers yet',
    mutuals:   'No mutual connections yet',
  }
  return (
    <div style={{ padding: '64px 20px', textAlign: 'center' }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 14px',
      }}>
        <UserCheck size={22} color="var(--color-text-muted)" strokeWidth={1.5} />
      </div>
      <p style={{ fontSize: 15, color: 'var(--color-text-muted)', margin: 0 }}>{msg[tab]}</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ConnectionsClient({
  username, initialTab,
  following, followers, mutuals,
  viewerId, viewerFollowingIds, viewerFollowerIds,
}: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  const viewerFollowingSet = new Set(viewerFollowingIds)
  const viewerFollowerSet  = new Set(viewerFollowerIds)

  function switchTab(tab: Tab) {
    setActiveTab(tab)
    router.replace(`/connections/${username}?tab=${tab}`, { scroll: false })
  }

  const lists: Record<Tab, UserRow[]> = { following, followers, mutuals }
  const current = lists[activeTab]

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)' }}>
        {TABS.map(({ key, label }) => {
          const active = activeTab === key
          const count  = lists[key].length
          return (
            <button
              key={key}
              onClick={() => switchTab(key)}
              style={{
                flex: 1, padding: '14px 4px',
                background: 'none', border: 'none',
                borderBottom: active ? '2px solid var(--color-brand)' : '2px solid transparent',
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                fontFamily: "'Syne', sans-serif",
                fontWeight: active ? 700 : 500,
                fontSize: 14, cursor: 'pointer',
                transition: 'color 0.15s',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {label}
              {count > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: 12,
                  color: active ? 'var(--color-brand)' : 'var(--color-text-faint)',
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* List */}
      {current.length === 0
        ? <Empty tab={activeTab} />
        : current.map(u => (
            <UserCard
              key={u.id}
              user={u}
              viewerId={viewerId}
              viewerFollowingSet={viewerFollowingSet}
              viewerFollowerSet={viewerFollowerSet}
            />
          ))
      }

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}