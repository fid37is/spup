'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTransition, useState, useEffect } from 'react'
import { Home, Bell, User, Search, Wallet, Settings, PenSquare } from 'lucide-react'
import { signOutAction } from '@/lib/actions'
import PostModal from '@/components/feed/post-modal'
import { ThemeToggle, useTheme } from '@/components/layout/theme-provider'

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
  const { theme } = useTheme()
  const initials = profile.display_name?.slice(0, 2).toUpperCase() || 'SP'

  // Collapse to icon-only between 768px and 1100px
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1100px)')
    setCollapsed(mq.matches)
    const handler = (e: MediaQueryListEvent) => setCollapsed(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  function handleSignOut() {
    startTransition(() => signOutAction())
  }

  return (
    <>
      <aside style={{
        width: collapsed ? 72 : 252,
        flexShrink: 0,
        position: 'sticky', top: 0,
        height: '100dvh',
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--color-border)',
        padding: collapsed ? '0 8px' : '0 12px',
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'var(--color-bg)',
        transition: 'width 0.2s ease, padding 0.2s ease',
      }}>

        {/* Logo */}
        <div style={{
          padding: collapsed ? '18px 0 20px' : '18px 10px 20px',
          display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <Link href="/feed" style={{
            textDecoration: 'none',
            display: 'flex', alignItems: 'center',
            gap: collapsed ? 0 : 10,
          }}>
            <img
              src={theme === 'dark' ? '/logo.png' : '/logo-light.png'}
              alt="Spup"
              style={{ height: 36, width: 'auto', display: 'block', flexShrink: 0 }}
            />
            {!collapsed && (
              <span style={{
                fontFamily: "'Syne', sans-serif",
                fontWeight: 800,
                fontSize: 26,
                letterSpacing: '-0.05em',
                lineHeight: 1,
                color: 'var(--color-text-primary)',
                textDecoration: 'underline',
                textDecorationColor: 'var(--color-brand)',
                textDecorationThickness: 3,
                textUnderlineOffset: 5,
                textDecorationStyle: 'wavy',
                display: 'flex',
                alignItems: 'center',
              }}>
                Spup
              </span>
            )}
          </Link>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1 }}>
          {NAV.map(({ href, icon: Icon, label, badge }) => {
            const isActive = pathname === href || (href !== '/feed' && pathname.startsWith(href))
            const showBadge = badge && unreadCount > 0

            return (
              <Link key={href} href={href} style={{ textDecoration: 'none', display: 'block' }}>
                <div
                  title={collapsed ? label : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    gap: 14,
                    padding: collapsed ? '11px 0' : '11px 12px',
                    borderRadius: 14, marginBottom: 2,
                    color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    background: isActive ? 'var(--active-item-bg)' : 'transparent',
                    transition: 'background 0.12s, color 0.12s',
                    position: 'relative',
                  }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                    {showBadge && (
                      <div style={{
                        position: 'absolute', top: -4, right: -6,
                        minWidth: 16, height: 16, borderRadius: 8,
                        background: 'var(--color-brand)',
                        border: '2px solid var(--color-bg)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 800, color: 'white',
                        padding: '0 3px', fontFamily: "'Syne', sans-serif",
                      }}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </div>
                    )}
                  </div>
                  {!collapsed && (
                    <span style={{
                      fontFamily: "'Syne', sans-serif",
                      fontWeight: isActive ? 700 : 500,
                      fontSize: 15,
                    }}>
                      {label}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </nav>

        {/* New Post button */}
        <div style={{ padding: '12px 0 10px' }}>
          <button
            onClick={() => setShowPostModal(true)}
            title={collapsed ? 'New post' : undefined}
            style={{
              width: '100%',
              background: 'var(--color-brand)', color: 'white',
              border: 'none', borderRadius: 14,
              padding: collapsed ? '13px 0' : '13px 20px',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8,
              fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
              cursor: 'pointer', letterSpacing: '0.01em',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-brand-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-brand)')}
          >
            <PenSquare size={18} />
            {!collapsed && 'New post'}
          </button>
        </div>

        {/* Profile chip */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: collapsed ? 0 : 10,
          padding: collapsed ? '12px 0' : '12px 10px',
          borderRadius: 14, marginBottom: 14,
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface-2)',
        }}>
          <div
            title={collapsed ? `${profile.display_name} · @${profile.username}` : undefined}
            style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--color-brand-dim), var(--color-brand))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 14, color: 'white',
              flexShrink: 0, cursor: collapsed ? 'default' : 'auto',
            }}>
            {initials}
          </div>

          {!collapsed && (
            <>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)',
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontFamily: "'Syne', sans-serif",
                }}>
                  {profile.display_name}
                  {profile.is_monetised && (
                    <span style={{
                      fontSize: 9, background: 'var(--color-gold)', color: '#000',
                      padding: '1px 5px', borderRadius: 4, fontWeight: 800,
                    }}>PRO</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 1 }}>
                  @{profile.username}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ThemeToggle />
                <button
                  onClick={handleSignOut}
                  disabled={isPending}
                  title="Sign out"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-muted)', padding: 4, borderRadius: 6,
                    fontSize: 16, display: 'flex', alignItems: 'center',
                    transition: 'color 0.15s', width: 36, height: 36,
                    justifyContent: 'center',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                >
                  ···
                </button>
              </div>
            </>
          )}

          {/* Show theme toggle in collapsed state too */}
          {collapsed && (
            <div style={{ position: 'absolute' }}>
              {/* Theme accessible via settings page in collapsed mode */}
            </div>
          )}
        </div>
      </aside>

      {showPostModal && <PostModal onClose={() => setShowPostModal(false)} />}
    </>
  )
}