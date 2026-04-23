// src/components/admin/admin-nav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, FileText, Megaphone,
  Flag, ShieldAlert, Settings, LogOut, Activity,
} from 'lucide-react'
import { signOutAction } from '@/lib/actions'
import { useTransition } from 'react'

const NAV = [
  { href: '/admin',            icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/admin/users',      icon: Users,           label: 'Users' },
  { href: '/admin/posts',      icon: FileText,        label: 'Posts' },
  { href: '/admin/ads',        icon: Megaphone,       label: 'Ads' },
  { href: '/admin/reports',    icon: Flag,            label: 'Reports' },
  { href: '/admin/moderation', icon: ShieldAlert,     label: 'Moderation' },
  { href: '/admin/activity',   icon: Activity,        label: 'Activity log' },
  { href: '/admin/waitlist',   icon: Users,           label: 'Waitlist' },
]

export default function AdminNav({ profile }: { profile: { role: string; display_name: string; username: string } }) {
  const pathname = usePathname()
  const [, startTransition] = useTransition()

  return (
    <aside style={{
      width: 220, flexShrink: 0, position: 'sticky', top: 0, height: '100dvh',
      borderRight: '1px solid #1E1E26', padding: '0 12px',
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
    }}>
      {/* Logo + role badge */}
      <div style={{ padding: '18px 10px 20px' }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: '#1A9E5F', letterSpacing: '-0.02em' }}>
          Spup
        </div>
        <div style={{
          marginTop: 6, display: 'inline-block',
          background: profile.role === 'admin' ? 'rgba(229,57,53,0.12)' : 'rgba(212,160,23,0.12)',
          border: `1px solid ${profile.role === 'admin' ? 'rgba(229,57,53,0.25)' : 'rgba(212,160,23,0.25)'}`,
          borderRadius: 6, padding: '2px 8px',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          color: profile.role === 'admin' ? '#E53935' : '#D4A017',
        }}>
          {profile.role.toUpperCase()}
        </div>
      </div>

      <nav style={{ flex: 1 }}>
        {NAV.map(({ href, icon: Icon, label }) => {
          const isActive = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
          return (
            <Link key={href} href={href} style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 10, marginBottom: 2,
                background: isActive ? 'rgba(26,158,95,0.1)' : 'transparent',
                color: isActive ? '#1A9E5F' : '#6A6A60',
                transition: 'background 0.12s, color 0.12s',
              }}>
                <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
                <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: isActive ? 700 : 500, fontSize: 14 }}>
                  {label}
                </span>
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Profile + sign out */}
      <div style={{ padding: '12px 0 16px', borderTop: '1px solid #1E1E26' }}>
        <div style={{ padding: '8px 12px', marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#F0F0EC', fontFamily: "'Syne', sans-serif" }}>{profile.display_name}</div>
          <div style={{ fontSize: 11, color: '#44444A' }}>@{profile.username}</div>
        </div>
        <button
          onClick={() => startTransition(() => signOutAction())}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: '100%', padding: '9px 12px', background: 'none', border: 'none',
            borderRadius: 10, cursor: 'pointer', color: '#6A6A60',
            fontSize: 14, fontFamily: "'DM Sans', sans-serif",
            transition: 'color 0.12s',
          }}
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </aside>
  )
}