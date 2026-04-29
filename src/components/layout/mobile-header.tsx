'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { X, Home, Search, Bell, Wallet, User, Settings, PenSquare } from 'lucide-react'
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

interface MobileHeaderProps {
  profile: {
    display_name: string
    username: string
    avatar_url: string | null
    is_monetised: boolean
    verification_tier: string
  }
  unreadCount: number
  title?: string
}

export default function MobileHeader({ profile, unreadCount, title }: MobileHeaderProps) {
  const [mounted, setMounted] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showPostModal, setShowPostModal] = useState(false)
  const pathname = usePathname()
  const { theme } = useTheme()
  const initials = profile.display_name?.slice(0, 2).toUpperCase() || 'SP'

  // Only render portals after hydration
  useEffect(() => { setMounted(true) }, [])

  // Lock body scroll when drawer open
  useEffect(() => {
    if (!mounted) return
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen, mounted])

  // Close on route change
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  const drawer = (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setDrawerOpen(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.55)',
          opacity: drawerOpen ? 1 : 0,
          pointerEvents: drawerOpen ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      />

      {/* Drawer panel */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 310,
        width: 280,
        background: 'var(--color-bg)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex', flexDirection: 'column',
        transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        overflowY: 'auto',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {/* Drawer header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 16px 12px', flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18,
            color: 'var(--color-text-primary)',
          }}>
            Account info
          </span>
          <button
            onClick={() => setDrawerOpen(false)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-secondary)', padding: 6,
              WebkitTapHighlightColor: 'transparent', borderRadius: 8,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Profile section */}
        <div style={{ padding: '0 16px 16px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', overflow: 'hidden', marginBottom: 10 }}>
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                background: 'linear-gradient(135deg, var(--color-brand-dim), var(--color-brand))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: 'white',
              }}>
                {initials}
              </div>
            )}
          </div>
          <div style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16,
            color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {profile.display_name}
            {profile.is_monetised && (
              <span style={{
                fontSize: 9, background: 'var(--color-gold)', color: '#000',
                padding: '1px 5px', borderRadius: 4, fontWeight: 800,
              }}>PRO</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
            @{profile.username}
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ padding: '8px 8px', flex: 1 }}>
          {NAV.map(({ href, icon: Icon, label, badge }) => {
            const isActive = pathname === href || (href !== '/feed' && pathname.startsWith(href))
            const showBadge = badge && unreadCount > 0
            return (
              <Link key={href} href={href} style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 12px', borderRadius: 14, marginBottom: 2,
                  color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  background: isActive ? 'var(--active-item-bg)' : 'transparent',
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

        {/* New post button */}
        <div style={{ padding: '8px 16px', flexShrink: 0 }}>
          <button
            onClick={() => { setDrawerOpen(false); setShowPostModal(true) }}
            style={{
              width: '100%', background: 'var(--color-brand)', color: 'white',
              border: 'none', borderRadius: 14, padding: '13px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
              cursor: 'pointer',
            }}
          >
            <PenSquare size={18} />
            New post
          </button>
        </div>

        {/* Theme toggle */}
        <div style={{
          padding: '12px 16px 16px', flexShrink: 0,
          borderTop: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 14, color: 'var(--color-text-muted)', fontFamily: "'Syne', sans-serif" }}>
            Theme
          </span>
          <ThemeToggle />
        </div>
      </div>

      {showPostModal && <PostModal onClose={() => setShowPostModal(false)} />}
    </>
  )

  return (
    <>
      {/* ── Top bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--nav-bg)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center',
        padding: '0 16px', height: 56, gap: 12,
      }}>
        {/* Left: avatar → opens drawer */}
        <button
          onClick={() => setDrawerOpen(true)}
          style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            overflow: 'hidden', background: 'none', border: 'none', padding: 0,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.display_name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{
              width: '100%', height: '100%', borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--color-brand-dim), var(--color-brand))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 13, color: 'white',
            }}>
              {initials}
            </div>
          )}
        </button>

        {/* Center: logo */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <Link href="/feed" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <img
              src={theme === 'dark' ? '/logo.png' : '/logo-light.png'}
              alt="Spup"
              style={{ height: 28, width: 'auto' }}
            />
          </Link>
        </div>

        {/* Right: wallet */}
        <Link href="/wallet" style={{
          color: 'var(--color-text-secondary)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          width: 34, height: 34, flexShrink: 0,
          WebkitTapHighlightColor: 'transparent',
        }}>
          <Wallet size={22} strokeWidth={1.8} />
        </Link>
      </div>

      {/* Portal: drawer + backdrop — only after hydration */}
      {mounted && createPortal(drawer, document.body)}
    </>
  )
}