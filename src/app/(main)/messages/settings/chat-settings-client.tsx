'use client'

// src/app/(main)/messages/settings/chat-settings-client.tsx
//
// Chat settings. Rows that aren't built yet are shown greyed out and can't be
// opened - they get switched on one by one as each feature ships (set
// `soon: false` and give the row an href / onClick).

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Bell, Mail, Video, RectangleEllipsis, ChartPie, Database, Wrench, ChevronRight } from 'lucide-react'
import { ChangeChatPinSheet } from '@/components/settings/change-chat-pin'
import HideMobileHeader from '@/components/layout/hide-mobile-header'

interface Row {
  key: string
  label: string
  icon: React.ReactNode
  soon: boolean
  href?: string
  onClick?: () => void
}

export default function ChatSettingsClient({ username }: { username: string }) {
  const router = useRouter()
  const [passcodeOpen, setPasscodeOpen] = useState(false)

  const rows: Row[] = [
    { key: 'notifications', label: 'Notifications', icon: <Bell size={22} />, soon: true },
    { key: 'requests', label: 'Message requests', icon: <Mail size={22} />, soon: true },
    { key: 'calls', label: 'Audio and video calls', icon: <Video size={22} />, soon: true },
    { key: 'passcode', label: 'Change passcode', icon: <RectangleEllipsis size={22} />, soon: false, onClick: () => setPasscodeOpen(true) },
    { key: 'data', label: 'Data usage', icon: <ChartPie size={22} />, soon: true },
    { key: 'storage', label: 'Storage', icon: <Database size={22} />, soon: true },
    { key: 'troubleshooting', label: 'Troubleshooting', icon: <Wrench size={22} />, soon: true },
  ]

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 18, width: '100%', boxSizing: 'border-box',
    padding: '18px 20px', background: 'none', border: 'none', textAlign: 'left',
    textDecoration: 'none', color: 'var(--color-text-primary)', fontFamily: "'DM Sans', sans-serif",
    WebkitTapHighlightColor: 'transparent',
  }

  function renderRow(r: Row) {
    const inner = (
      <>
        <span style={{ display: 'flex', color: 'var(--color-text-secondary)' }}>{r.icon}</span>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{r.label}</span>
        {r.soon && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '2px 8px' }}>Soon</span>}
        <ChevronRight size={20} color="var(--color-text-faint)" />
      </>
    )
    if (r.soon) {
      return (
        <div key={r.key} role="button" aria-disabled="true" title="Coming soon" style={{ ...rowStyle, opacity: 0.4, cursor: 'not-allowed' }}>
          {inner}
        </div>
      )
    }
    if (r.href) return <Link key={r.key} href={r.href} style={{ ...rowStyle, cursor: 'pointer' }}>{inner}</Link>
    return <button key={r.key} onClick={r.onClick} style={{ ...rowStyle, cursor: 'pointer' }}>{inner}</button>
  }

  return (
    <div>
      <HideMobileHeader />
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        // The app's top bar is hidden on this screen (HideMobileHeader), so clear the status bar here.
        padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 16px 10px', display: 'flex', alignItems: 'center', gap: 22,
      }}>
        <button
          type="button" aria-label="Back"
          onClick={() => (window.history.length > 1 ? router.back() : router.replace('/messages'))}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', color: 'var(--color-text-primary)' }}
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, margin: 0, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
            Chat settings
          </h1>
          {username && <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>@{username}</div>}
        </div>
      </div>

      {rows.map(renderRow)}

      <ChangeChatPinSheet open={passcodeOpen} onClose={() => setPasscodeOpen(false)} />
    </div>
  )
}