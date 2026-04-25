import Link from 'next/link'
import { Search } from 'lucide-react'
import { getSuggestedUsers } from '@/lib/queries'
import { formatNaira } from '@/lib/utils'
import { createClient } from '@/lib/supabase/server'

const FALLBACK_TRENDING = [
  { tag: 'LagosPara',    posts_count: 14200 },
  { tag: 'SuperEagles',  posts_count: 8900  },
  { tag: 'CBNPolicy',    posts_count: 6100  },
  { tag: 'NaijaFashion', posts_count: 4400  },
  { tag: 'AbujaTech',    posts_count: 3200  },
]

async function getTrending() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('hashtags').select('tag, posts_count')
    .order('posts_count', { ascending: false }).limit(6)
  return (data && data.length > 0) ? data : FALLBACK_TRENDING
}

interface RightSidebarProps {
  profile: { id: string; is_monetised: boolean }
  walletBalance: number
}

export default async function RightSidebar({ profile, walletBalance }: RightSidebarProps) {
  const supabase = await createClient()
  const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', profile.id)
  const followingIds = (follows || []).map((f: { following_id: string }) => f.following_id)

  const [trending, suggested] = await Promise.all([
    getTrending(),
    getSuggestedUsers([profile.id, ...followingIds], 3),
  ])

  const AVATAR_COLORS = ['#1A7A4A', '#7A3A1A', '#1A4A7A']

  return (
    <aside style={{
      width: 300, flexShrink: 0,
      padding: '16px 16px 16px 20px',
      display: 'flex', flexDirection: 'column', gap: 16,
      overflowY: 'auto', position: 'sticky', top: 0, height: '100dvh',
    }}>
      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{
          position: 'absolute', left: 14, top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--color-text-muted)', pointerEvents: 'none',
        }} />
        <Link href="/explore">
          <input
            type="search"
            placeholder="Search Spup"
            readOnly
            style={{
              width: '100%',
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: 24,
              padding: '11px 16px 11px 38px',
              color: 'var(--color-text-muted)',
              fontSize: 14, outline: 'none',
              fontFamily: "'DM Sans', sans-serif",
              cursor: 'pointer',
            }}
          />
        </Link>
      </div>

      {/* Earnings widget */}
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
            {formatNaira(walletBalance)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, marginBottom: 14 }}>
            Available to withdraw
          </div>
          <Link href="/wallet" style={{
            display: 'block', textAlign: 'center', padding: '9px',
            background: 'var(--color-brand)',
            borderRadius: 10, color: 'white',
            fontSize: 13, fontWeight: 700,
            textDecoration: 'none', fontFamily: "'Syne', sans-serif",
          }}>
            View wallet →
          </Link>
        </div>
      )}

      {/* Trending */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 16, overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)' }}>
            Trending in Nigeria 🇳🇬
          </h3>
        </div>
        {trending.map((t: any, i: number) => (
          <Link key={t.tag} href={`/explore?q=${t.tag}`} style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{
              padding: '11px 16px',
              borderBottom: i < trending.length - 1 ? '1px solid var(--color-border)' : 'none',
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 2 }}>#{i + 1} Trending</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif" }}>#{t.tag}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{(t.posts_count as number).toLocaleString()} posts</div>
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
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)' }}>
              Who to follow
            </h3>
          </div>
          {suggested.map((u: any, i: number) => (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 16px',
              borderBottom: i < suggested.length - 1 ? '1px solid var(--color-border)' : 'none',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 13, color: 'white',
              }}>
                {u.display_name?.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif" }}>
                  {u.display_name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>@{u.username}</div>
              </div>
              <button style={{
                padding: '5px 13px', borderRadius: 20,
                border: '1px solid var(--color-brand)',
                background: 'transparent',
                color: 'var(--color-brand)',
                fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: "'Syne', sans-serif",
              }}>
                Follow
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--color-text-faint)', lineHeight: 1.8 }}>
        Privacy · Terms · Content Policy · © 2026 Spup Technologies Limited
      </div>
    </aside>
  )
}