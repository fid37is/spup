'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, Bell, Wallet, User } from 'lucide-react'

const NAV = [
  { href: '/feed',          icon: Home,   label: 'Home' },
  { href: '/explore',       icon: Search, label: 'Explore' },
  { href: '/notifications', icon: Bell,   label: 'Alerts', badge: true },
  { href: '/wallet',        icon: Wallet, label: 'Wallet' },
  { href: '/profile',       icon: User,   label: 'Profile' },
]

export default function MobileBottomNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname()

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0, left: 0, right: 0,
      zIndex: 100,
      background: 'var(--color-nav-bg)',
      borderTop: '1px solid var(--color-border)',
      display: 'flex',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {NAV.map(({ href, icon: Icon, label, badge }) => {
        const isActive = pathname === href || (href !== '/feed' && pathname.startsWith(href))
        const showBadge = badge && unreadCount > 0
        return (
          <Link key={href} href={href} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 4, padding: '10px 0',
            color: isActive ? 'var(--color-brand)' : 'var(--color-text-muted)',
            textDecoration: 'none',
            transition: 'color 0.12s',
            WebkitTapHighlightColor: 'transparent',
            position: 'relative',
          }}>
            <div style={{ position: 'relative' }}>
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              {showBadge && (
                <span style={{
                  position: 'absolute', top: -4, right: -6,
                  minWidth: 16, height: 16,
                  background: 'var(--color-brand)',
                  borderRadius: 8, fontSize: 10, fontWeight: 700,
                  color: 'white', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px',
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400 }}>{label}</span>
            {isActive && (
              <span style={{
                position: 'absolute', top: 0, left: '50%',
                transform: 'translateX(-50%)',
                width: 24, height: 2,
                background: 'var(--color-brand)',
                borderRadius: '0 0 2px 2px',
              }} />
            )}
          </Link>
        )
      })}
    </nav>
  )
}