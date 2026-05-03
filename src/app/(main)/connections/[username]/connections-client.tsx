// src/app/(main)/connections/[username]/connections-client.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserCheck } from 'lucide-react'

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

function UserCard({ user }: { user: UserRow }) {
  const router = useRouter()
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
            color: 'var(--color-text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user.display_name}
          </span>
          {user.verification_tier !== 'none' && (
            <span style={{
              width: 16, height: 16, borderRadius: '50%',
              background: 'var(--color-brand)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, color: 'white', flexShrink: 0,
            }}>✓</span>
          )}
          {user.is_monetised && (
            <span style={{
              fontSize: 9, background: 'var(--color-gold)', color: '#000',
              padding: '1px 5px', borderRadius: 3, fontWeight: 700, flexShrink: 0,
            }}>PRO</span>
          )}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 1 }}>
          @{user.username}
          {user.followers_count > 0 && (
            <span> · {user.followers_count.toLocaleString()} followers</span>
          )}
        </div>
        {user.bio && (
          <div style={{
            fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user.bio}
          </div>
        )}
      </div>
    </div>
  )
}

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

export default function ConnectionsClient({ username, initialTab, following, followers, mutuals }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

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
        : current.map(u => <UserCard key={u.id} user={u} />)
      }
    </div>
  )
}