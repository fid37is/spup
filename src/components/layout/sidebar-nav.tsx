'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { Home, Bell, User, Search, Wallet, Settings, PenSquare } from 'lucide-react'
import { signOutAction } from '@/lib/actions'
import PostModal from '@/components/feed/post-modal'
import { useState } from 'react'

const NAV = [
  { href: '/feed',          icon: Home,     label: 'Home' },
  { href: '/explore',       icon: Search,   label: 'Explore' },
  { href: '/notifications', icon: Bell,     label: 'Notifications', badge: true },
  { href: '/wallet',        icon: Wallet,   label: 'Wallet' },
  { href: '/profile',       icon: User,     label: 'Profile' },
  { href: '/settings',      icon: Settings, label: 'Settings' },
]

interface SidebarNavProps {
  profile: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
    is_monetised: boolean
    verification_tier: string
  }
  unreadCount: number
}

export default function SidebarNav({ profile, unreadCount }: SidebarNavProps) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [showPostModal, setShowPostModal] = useState(false)
  const initials = profile.display_name?.slice(0, 2).toUpperCase() || 'PA'

  function handleSignOut() {
    startTransition(() => signOutAction())
  }

  return (
    <>
      <aside style={{
        width: 252, flexShrink: 0, position: 'sticky', top: 0,
        height: '100dvh', display: 'flex', flexDirection: 'column',
        borderRight: '1px solid #1A1A1A', padding: '0 12px',
        overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ padding: '18px 10px 20px' }}>
          <Link href="/feed" style={{ textDecoration: 'none' }}>
            <span style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 800,
              fontSize: 26, color: 'var(--color-brand)', letterSpacing: '-0.02em',
            }}>Spup</span>
          </Link>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1 }}>
          {NAV.map(({ href, icon: Icon, label, badge }) => {
            const isActive = pathname === href || (href !== '/feed' && pathname.startsWith(href))
            const showBadge = badge && unreadCount > 0

            return (
              <Link key={href} href={href} style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '11px 12px', borderRadius: 14, marginBottom: 2,
                  color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  background: isActive ? 'var(--color-nav-active-bg)' : 'transparent',
                  transition: 'background 0.12s, color 0.12s',
                  position: 'relative',
                }}>
                  <div style={{ position: 'relative' }}>
                    <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                    {showBadge && (
                      <div style={{
                        position: 'absolute', top: -4, right: -6,
                        minWidth: 16, height: 16, borderRadius: 8,
                        background: 'var(--color-brand)', border: '2px solid #0A0A0A',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 800, color: 'white',
                        padding: '0 3px',
                        fontFamily: "'Syne', sans-serif",
                      }}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontFamily: "'Syne', sans-serif",
                    fontWeight: isActive ? 700 : 500, fontSize: 15,
                  }}>
                    {label}
                  </span>
                </div>
              </Link>
            )
          })}
        </nav>

        {/* New Post button */}
        <div style={{ padding: '12px 0 10px' }}>
          <button
            onClick={() => setShowPostModal(true)}
            style={{
              width: '100%', background: '#1A7A4A', color: 'white',
              border: 'none', borderRadius: 14, padding: '13px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
              cursor: 'pointer', letterSpacing: '0.01em',
              transition: 'background 0.15s',
            }}
          >
            <PenSquare size={18} />
            New post
          </button>
        </div>

        {/* Profile chip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 10px', borderRadius: 14, marginBottom: 14,
          cursor: 'pointer', transition: 'background 0.12s',
          border: '1px solid #1A1A1A',
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            background: 'linear-gradient(135deg, #1A7A4A, #22A861)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 14, color: 'white',
            flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 5, fontFamily: "'Syne', sans-serif" }}>
              {profile.display_name}
              {profile.is_monetised && (
                <span style={{ fontSize: 9, background: '#D4A017', color: '#000', padding: '1px 5px', borderRadius: 4, fontWeight: 800 }}>PRO</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#3A3A35', marginTop: 1 }}>@{profile.username}</div>
          </div>
          <button
            onClick={handleSignOut}
            disabled={isPending}
            title="Sign out"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#3A3A35', padding: 4, borderRadius: 6,
              fontSize: 16, display: 'flex', alignItems: 'center',
              transition: 'color 0.15s',
            }}
          >
            ···
          </button>
        </div>
      </aside>

      {showPostModal && <PostModal onClose={() => setShowPostModal(false)} />}
    </>
  )
}