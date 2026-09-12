// src/components/admin/admin-nav.tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, FileText, Megaphone,
  Flag, ShieldAlert, LogOut, Activity, Radio,
  Wallet, BadgeCheck, UserPlus, Menu, X,
} from 'lucide-react'
import { signOutAction } from '@/lib/actions'
import { cn } from '@/lib/utils'

// NOTE: these hrefs are intentionally NOT prefixed with /dashboard.
// proxy.ts rewrites every request on the admin.* subdomain to /dashboard/*
// internally, so the visible URL (and these links) should stay clean —
// e.g. admin.spup.live/users, not admin.spup.live/dashboard/users.
const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { href: '/',              icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/activity-feed', icon: Radio,           label: 'Live activity' },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/users',        icon: Users,      label: 'Users' },
      { href: '/verification', icon: BadgeCheck, label: 'Verification' },
      { href: '/waitlist',     icon: UserPlus,   label: 'Waitlist' },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/posts',       icon: FileText,  label: 'Posts' },
      { href: '/ads',         icon: Megaphone, label: 'Ads' },
      { href: '/promotions',  icon: Megaphone, label: 'Promotions' },
    ],
  },
  {
    label: 'Trust & safety',
    items: [
      { href: '/reports',     icon: Flag,        label: 'Reports' },
      { href: '/moderation',  icon: ShieldAlert, label: 'Moderation' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/finance', icon: Wallet, label: 'Finance' },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/activity', icon: Activity, label: 'Audit log' },
    ],
  },
]

type Profile = { role: string; display_name: string; username: string }

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === 'admin'
  return (
    <span
      className={cn(
        'inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold tracking-wide',
        isAdmin
          ? 'bg-error/10 border-error/25 text-error'
          : 'bg-gold/10 border-gold/25 text-gold'
      )}
    >
      {role.toUpperCase()}
    </span>
  )
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1">
      {NAV_GROUPS.map(group => (
        <div key={group.label} className="mb-[18px]">
          <div className="px-3 pb-1.5 text-[10px] font-bold tracking-[0.08em] text-faint">
            {group.label.toUpperCase()}
          </div>
          {group.items.map(({ href, icon: Icon, label }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link key={href} href={href} onClick={onNavigate} className="block no-underline">
                <div
                  className={cn(
                    'mb-0.5 flex items-center gap-3 rounded-btn px-3 py-2.5 transition-colors',
                    isActive ? 'bg-brand-muted text-brand' : 'text-secondary'
                  )}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
                  <span className={cn('font-display text-[13.5px]', isActive ? 'font-bold' : 'font-medium')}>
                    {label}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

function ProfileFooter({ profile }: { profile: Profile }) {
  const [, startTransition] = useTransition()
  return (
    <div className="border-t border-border px-0 pb-4 pt-3">
      <div className="mb-1 px-3 py-2">
        <div className="font-display text-[13px] font-semibold text-primary">{profile.display_name}</div>
        <div className="text-[11px] text-faint">@{profile.username}</div>
      </div>
      <button
        onClick={() => startTransition(() => signOutAction())}
        className="flex w-full items-center gap-2.5 rounded-btn px-3 py-2.5 text-[14px] text-secondary transition-colors hover:text-primary"
      >
        <LogOut size={16} /> Sign out
      </button>
    </div>
  )
}

export default function AdminNav({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Close the drawer whenever the route changes
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  return (
    <>
      {/* Mobile top bar (below md) */}
      <div className="sticky top-0 z-[50] flex h-14 items-center gap-3 border-b border-border bg-bg/95 px-4 backdrop-blur-lg md:hidden">
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-primary"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <span className="font-display text-lg font-extrabold tracking-tight text-brand">Spup Admin</span>
        <div className="ml-auto">
          <RoleBadge role={profile.role} />
        </div>
      </div>

      {/*
        Rendered inline, NOT via createPortal(..., document.body) — globals.css
        has `body > * { position: relative; z-index: 1; }` to keep page
        content above a decorative background grid. That rule was overriding
        `fixed` on anything portaled directly into body (unlayered CSS always
        beats Tailwind's layered utilities), which is why this was rendering
        in normal document flow instead of as an overlay. Nothing in this
        layout clips overflow, so `fixed` positions correctly from here
        without needing to escape into body at all. */}
      <div
        onClick={() => setDrawerOpen(false)}
        className={cn(
          'fixed inset-0 z-[300] bg-black/55 transition-opacity duration-200 md:hidden',
          drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      />
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-[310] flex w-[80vw] max-w-[280px] flex-col md:hidden',
          'border-r border-border bg-bg pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ease-out',
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-shrink-0 items-center justify-between px-4 pb-3 pt-4">
          <div className="flex items-center gap-2">
            <span className="font-display text-xl font-extrabold tracking-tight text-brand">Spup</span>
            <RoleBadge role={profile.role} />
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="rounded-lg p-1.5 text-secondary"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          <NavLinks pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
        </div>
        <div className="flex-shrink-0">
          <ProfileFooter profile={profile} />
        </div>
      </div>

      {/* Desktop sidebar (md and up) */}
      <aside className="sticky top-0 hidden h-dvh w-[232px] flex-shrink-0 flex-col border-r border-border px-3 md:flex">
        <div className="flex-shrink-0 px-2.5 pb-5 pt-[18px]">
          <div className="font-display text-[22px] font-extrabold tracking-tight text-brand">Spup</div>
          <div className="mt-1.5">
            <RoleBadge role={profile.role} />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavLinks pathname={pathname} />
        </div>
        <div className="flex-shrink-0">
          <ProfileFooter profile={profile} />
        </div>
      </aside>
    </>
  )
}
