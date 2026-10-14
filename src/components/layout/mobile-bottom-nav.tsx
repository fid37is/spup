'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { Home, Search, Bell, MessageSquare, Plus } from 'lucide-react'
import { useChatUnread } from '@/hooks/use-chat-unread'
import { useTranslation } from '@/lib/i18n/language-context'
import { useWarmTabs } from '@/hooks/use-warm-tabs'
import { useChromeVisible, showChrome } from '@/lib/chrome-visibility'

// Two tabs, the compose button in the middle, two tabs - same destinations,
// badges and behaviour as before; only the look changed.
const LEFT = [
  { href: '/feed',          icon: Home,          labelKey: 'nav.home' },
  { href: '/explore',       icon: Search,        labelKey: 'nav.explore' },
]
const RIGHT = [
  { href: '/notifications', icon: Bell,          labelKey: 'nav.alerts',  badge: 'alerts' },
  { href: '/messages',      icon: MessageSquare, labelKey: 'nav.chat',    badge: 'chat' },
]
type Item = { href: string; icon: typeof Home; labelKey: string; badge?: string }

const PILL_HEIGHT = 62
const SIDE_GAP = 16

export default function MobileBottomNav({ unreadCount, unreadChat, userId }: { unreadCount: number; unreadChat: number; userId: string }) {
  const pathname = usePathname()
  const { t } = useTranslation()
  // Live count for the Chat tab (hooks must run before the early return below).
  const chatUnread = useChatUnread(unreadChat, userId)
  // Once idle on a good connection, the other tabs are fetched in the background.
  const warm = useWarmTabs()
  // Slides away on scroll-down and comes back on scroll-up.
  const chromeVisible = useChromeVisible()
  // A new page always starts with the bar showing.
  useEffect(() => { showChrome() }, [pathname])

  // Focused, full-screen sub-pages hide the nav entirely, matching how X's own
  // Post Activity screen has no bottom tab bar — these are drill-down detail
  // views, not top-level destinations. Post detail (the comment thread) is
  // one of these too - none of the Threads reference screens this redesign
  // is matching ever show a tab bar on the comment screen.
  const hiddenOn = [/^\/post\/[^/]+$/, /^\/post\/[^/]+\/activity/, /^\/messages\/[^/]+/, /^\/compose/]
  if (hiddenOn.some(re => re.test(pathname))) return null

  function renderTab({ href, icon: Icon, labelKey, badge }: Item) {
    const label = t(labelKey)
    const isActive = pathname === href || (href !== '/feed' && pathname.startsWith(href))
    const badgeCount = badge === 'alerts' ? unreadCount : badge === 'chat' ? chatUnread : 0
    const showBadge = badgeCount > 0
    return (
      <Link key={href} href={href} prefetch={warm ? true : undefined}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
        // Tapping Home while already on the feed takes you back to the top of it
        // (instead of doing nothing), the way other social apps do.
        onClick={href === '/feed' && pathname === '/feed' ? (e) => {
          e.preventDefault()
          window.scrollTo({ top: 0, behavior: 'smooth' })
        } : undefined}
        style={{
          // The current tab grows to hold its label inside a soft pill; the others are icon-only.
          flex: isActive ? '2.4 1 0' : '1 1 0',
          minWidth: 0, height: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          borderRadius: 22,
          background: isActive ? 'var(--color-surface-3)' : 'transparent',
          color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          textDecoration: 'none', position: 'relative',
          transition: 'flex-grow 0.22s cubic-bezier(0.4, 0, 0.2, 1), background 0.18s, color 0.12s',
          WebkitTapHighlightColor: 'transparent',
        }}>
        <span style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
          <Icon size={21} strokeWidth={isActive ? 2.3 : 1.8} />
          {showBadge && (
            <span data-testid={`nav-badge-${badge}`} aria-label={`${badgeCount} unread`} style={{
              position: 'absolute', top: -6, right: -8,
              minWidth: 16, height: 16,
              background: 'var(--color-brand)',
              border: '2px solid var(--color-surface-raised)', boxSizing: 'content-box',
              borderRadius: 10, fontSize: 10, fontWeight: 700,
              color: 'white', display: 'flex',
              alignItems: 'center', justifyContent: 'center', padding: '0 3px',
            }}>
              {badge === 'chat' ? (badgeCount > 99 ? '99+' : badgeCount) : (badgeCount > 9 ? '9+' : badgeCount)}
            </span>
          )}
        </span>
        {isActive && (
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}
          </span>
        )}
      </Link>
    )
  }

  return (
    // The <nav> stays a full-width fixed bar at bottom:0 (the native app measures
    // it to place the ad banner above it); it is transparent and lets taps through
    // everywhere except the floating pill inside it.
    <nav aria-hidden={!chromeVisible} style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      display: 'flex', justifyContent: 'center',
      padding: `0 ${SIDE_GAP}px calc(10px + env(safe-area-inset-bottom))`,
      transform: chromeVisible ? 'translateY(0)' : 'translateY(calc(100% + 1px))',
      transition: 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
      pointerEvents: 'none',
      willChange: 'transform',
    }}>
      <div style={{
        width: '100%', maxWidth: 420, height: PILL_HEIGHT,
        display: 'flex', alignItems: 'center', gap: 4, padding: 6,
        borderRadius: PILL_HEIGHT / 2,
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-light)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.22)',
        pointerEvents: chromeVisible ? 'auto' : 'none',
      }}>
        {LEFT.map(renderTab)}

        {/* Compose - opens the /compose page (New post) */}
        <Link href="/compose" prefetch={warm ? true : undefined} aria-label="New post" style={{
          flex: '0 0 auto', width: 50, height: 50, margin: '0 4px',
          borderRadius: '50%',
          background: 'var(--color-brand)', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(26,158,95,0.45)',
          textDecoration: 'none', WebkitTapHighlightColor: 'transparent',
        }}>
          <Plus size={26} strokeWidth={2.4} />
        </Link>

        {RIGHT.map(renderTab)}
      </div>
    </nav>
  )
}