// src/components/layout/right-sidebar.tsx

import Link from 'next/link'
import { Search } from 'lucide-react'
import { formatNaira } from '@/lib/utils'
import { createClient } from '@/lib/supabase/server'
import SidebarFollowBtn from './sidebar-follow-btn'

const FALLBACK_TRENDING = [
  { tag: 'LagosPara',    posts_count: 14200 },
  { tag: 'SuperEagles',  posts_count: 8900  },
  { tag: 'CBNPolicy',    posts_count: 6100  },
  { tag: 'NaijaFashion', posts_count: 4400  },
  { tag: 'AbujaTech',    posts_count: 3200  },
]

const AVATAR_COLORS = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A6A1A']

interface RightSidebarProps {
  profile: { id: string; is_monetised: boolean }
  walletBalance: number
}

export default async function RightSidebar({ profile, walletBalance }: RightSidebarProps) {
  // Single client reused for all queries in this component
  const supabase = await createClient()

  // Trending hashtags
  const { data: hashtagData } = await supabase
    .from('hashtags')
    .select('tag, posts_count')
    .order('posts_count', { ascending: false })
    .limit(6)
  const trending = (hashtagData && hashtagData.length > 0) ? hashtagData : FALLBACK_TRENDING

  // Who to follow — exclude the viewer and anyone they already follow
  const { data: follows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', profile.id)
  const followingIds = (follows || []).map((f: { following_id: string }) => f.following_id)
  const excludeIds = [profile.id, ...followingIds]

  // Safe exclusion — Supabase .not('id','in','()') crashes on empty array
  let suggestedQuery = supabase
    .from('users')
    .select('id, username, display_name, avatar_url, verification_tier, followers_count')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('followers_count', { ascending: false })
    .limit(3)

  if (excludeIds.length > 0) {
    suggestedQuery = suggestedQuery.not('id', 'in', `(${excludeIds.join(',')})`)
  }

  const { data: suggestedData } = await suggestedQuery
  const suggested = suggestedData || []

  return (
    <aside style={{
      width: 300, flexShrink: 0,
      padding: '16px 16px 16px 20px',
      display: 'flex', flexDirection: 'column', gap: 16,
      overflowY: 'auto', position: 'sticky', top: 0, height: '100dvh',
    }}>

      {/* Explore link — clicking takes you to /explore where the real search lives */}
      <Link href="/explore" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 24, background: 'var(--color-surface-2)', border: '1.5px solid var(--color-border-light)', transition: 'border-color 0.15s' }}>
        <Search size={15} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
        <span style={{ fontSize: 14, color: 'var(--color-text-secondary)', fontFamily: "'DM Sans', sans-serif" }}>
          Search Spup
        </span>
      </Link>

      {/* Earnings widget — only for monetised creators */}
      {profile.is_monetised && (
        <div style={{
          background: 'linear-gradient(135deg, var(--color-brand-muted) 0%, var(--color-gold-muted) 100%)',
          border: '1px solid var(--color-brand-border)',
          borderRadius: 16, padding: 16,
        }}>
          <div style={{ fontSize: 11, color: 'var(--color-brand)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>
            AVAILABLE BALANCE
          </div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 26, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            {/* walletBalance is in kobo — formatNaira divides by 100 */}
            {formatNaira(walletBalance)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4, marginBottom: 14 }}>
            Available to withdraw
          </div>
          <Link href="/wallet" style={{
            display: 'block', textAlign: 'center', padding: '9px',
            background: 'var(--color-brand)', borderRadius: 10,
            color: 'white', fontSize: 13, fontWeight: 700,
            textDecoration: 'none', fontFamily: "'Syne', sans-serif",
          }}>
            View wallet →
          </Link>
        </div>
      )}

      {/* Trending in Nigeria */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 16, overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', margin: 0 }}>
            Trending in Nigeria 🇳🇬
          </h3>
        </div>
        {trending.map((t: any, i: number) => (
          <Link key={t.tag} href={`/explore?q=${encodeURIComponent(t.tag)}`} style={{ textDecoration: 'none', display: 'block' }}>
            <div
              style={{
                padding: '11px 16px',
                borderBottom: i < trending.length - 1 ? '1px solid var(--color-border)' : 'none',
                transition: 'background 0.12s',
              }}
              onMouseEnter={undefined}
            >
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 2 }}>
                #{i + 1} Trending
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif" }}>
                #{t.tag}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                {(t.posts_count as number).toLocaleString()} posts
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Who to follow */}
      {suggested.length > 0 && (
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 16, overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--color-border)' }}>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', margin: 0 }}>
              Who to follow
            </h3>
          </div>
          {suggested.map((u: any, i: number) => {
            const initial = u.display_name?.slice(0, 2).toUpperCase() ?? '??'
            const avatarColor = AVATAR_COLORS[u.username.charCodeAt(0) % AVATAR_COLORS.length]
            return (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 16px',
                borderBottom: i < suggested.length - 1 ? '1px solid var(--color-border)' : 'none',
              }}>
                {/* Avatar — real photo if available, initials fallback */}
                <Link href={`/user/${u.username}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: u.avatar_url ? 'transparent' : avatarColor,
                    overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 13, color: 'white',
                    position: 'relative',
                  }}>
                    {u.avatar_url
                      ? <img src={u.avatar_url} alt={u.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : initial
                    }
                  </div>
                </Link>

                {/* Name + username */}
                <Link href={`/user/${u.username}`} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      fontFamily: "'Syne', sans-serif",
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {u.display_name}
                    </span>
                    {/* Verification badge */}
                    {u.verification_tier && u.verification_tier !== 'none' && (
                      <span style={{
                        width: 14, height: 14, borderRadius: '50%',
                        background: u.verification_tier === 'gold' ? '#D4A017' : 'var(--color-brand)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 8, color: 'white', flexShrink: 0,
                      }}>✓</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 1 }}>
                    @{u.username}
                  </div>
                </Link>

                {/* Follow button — wired to toggleFollowAction */}
                <SidebarFollowBtn targetUserId={u.id} />
              </div>
            )
          })}

          <Link href="/explore?tab=people" style={{
            display: 'block', padding: '11px 16px',
            fontSize: 13, color: 'var(--color-brand)',
            textDecoration: 'none', fontWeight: 600,
            borderTop: '1px solid var(--color-border)',
          }}>
            Show more →
          </Link>
        </div>
      )}

      {/* Footer */}
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
        <Link href="/privacy" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy</Link>
        {' · '}
        <Link href="/terms" style={{ color: 'inherit', textDecoration: 'none' }}>Terms</Link>
        {' · '}
        <Link href="/content-policy" style={{ color: 'inherit', textDecoration: 'none' }}>Content Policy</Link>
        <br />© 2026 Spup Technologies Limited
      </div>
    </aside>
  )
}