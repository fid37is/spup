// src/app/(main)/notifications/settings/settings-ui.tsx
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowLeft, BellOff, Loader } from 'lucide-react'
import { updateNotificationSettingsAction, disablePostNotificationsAction, type PostNotificationTarget } from '@/lib/actions/notification-settings'
import { updateProfileAction } from '@/lib/actions/profiles'
import type { NotificationSettingKey, NotificationSettings } from '@/lib/notification-settings'
import { NotifAvatar } from '@/components/notifications/avatar'
import HideMobileHeader from '@/components/layout/hide-mobile-header'
import { enableWebPush } from '@/hooks/use-web-push'
import VerifiedBadge from '@/components/ui/verified-badge'

/* ── Header (back arrow + title + optional @username, like X) ──────────────── */

export function SettingsHeader({
  title, subtitle, backHref = '/notifications/settings',
}: { title: string; subtitle?: string; backHref?: string }) {
  return (
    <>
    <HideMobileHeader />
    <div style={{
      position: 'sticky', top: 0, zIndex: 20,
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      background: 'var(--nav-bg)', borderBottom: '1px solid var(--color-border)',
      display: 'flex', alignItems: 'center', gap: 20, padding: '0 12px', height: 56,
    }}>
      <Link
        href={backHref}
        aria-label="Back"
        style={{
          width: 38, height: 38, borderRadius: '50%', color: 'var(--color-text-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <ArrowLeft size={22} />
      </Link>
      <div style={{ minWidth: 0 }}>
        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 19, lineHeight: 1.15,
          color: 'var(--color-text-primary)', margin: 0,
        }}>
          {title}
        </h1>
        {subtitle && <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{subtitle}</div>}
      </div>
    </div>
    </>
  )
}

export function Intro({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      margin: 0, padding: '16px 20px', fontSize: 15, lineHeight: 1.45,
      color: 'var(--color-text-muted)', fontFamily: "'DM Sans', sans-serif",
    }}>
      {children}
    </p>
  )
}

/* ── Menu row (Filters / Preferences / Post notifications) ────────────────── */

export function MenuRow({
  href, icon, title, desc,
}: { href: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="ns-row"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 18, padding: '16px 20px',
        textDecoration: 'none', color: 'inherit',
      }}
    >
      <div style={{ width: 28, flexShrink: 0, color: 'var(--color-text-secondary)', paddingTop: 2 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontSize: 15, color: 'var(--color-text-muted)', lineHeight: 1.35, marginTop: 2 }}>{desc}</div>
      </div>
      <style>{`.ns-row:hover{background:var(--color-surface-2)}`}</style>
    </Link>
  )
}

/* ── Toggles ─────────────────────────────────────────────────────────────── */

type ToggleKey = NotificationSettingKey | 'notif_push' | 'notif_email'

export interface ToggleRowDef {
  key: ToggleKey
  label: string
  desc?: string
}
export interface ToggleSection {
  title?: string
  note?: string
  rows: ToggleRowDef[]
}

function Switch({ checked, onChange, disabled, label }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', padding: 0, flexShrink: 0,
        background: checked ? 'var(--color-brand)' : 'var(--color-surface-3)',
        position: 'relative', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1, transition: 'background 0.2s',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 23 : 3, width: 18, height: 18,
        borderRadius: '50%', background: 'white', transition: 'left 0.18s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      }} />
    </button>
  )
}

/**
 * A list of switches that save as you flip them. Optimistic: the switch moves
 * immediately and snaps back (with a message) if the save fails.
 */
export function ToggleList({
  sections, initial,
}: {
  sections: ToggleSection[]
  initial: Record<string, boolean>
}) {
  const [values, setValues] = useState<Record<string, boolean>>(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [, start] = useTransition()

  function flash(text: string, ok: boolean) {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 4500)
  }

  function change(key: ToggleKey, next: boolean) {
    const prev = values[key]
    setValues(v => ({ ...v, [key]: next }))
    setBusy(key)
    start(async () => {
      const r = key === 'notif_push'
        ? await updateProfileAction({ notif_push: next })
        : key === 'notif_email'
          ? await updateProfileAction({ notif_email: next })
          : await updateNotificationSettingsAction({ [key]: next } as Partial<NotificationSettings>)
      if ((r as any)?.error) {
        setBusy(null)
        setValues(v => ({ ...v, [key]: prev }))
        flash((r as any).error, false)
        return
      }

      // Switching push ON should actually enable it on this device: ask the
      // browser for permission and register the subscription.
      if (key === 'notif_push' && next) {
        const status = await enableWebPush()
        if (status === 'denied') {
          flash('Notifications are blocked in your browser settings. Allow them for this site to get push alerts.', false)
        } else if (status === 'unsupported') {
          flash('This browser does not support push notifications.', false)
        }
      }
      setBusy(null)
    })
  }

  return (
    <div>
      {sections.map((sec, i) => (
        <div key={i}>
          {sec.title && (
            <div style={{
              padding: '22px 20px 6px', fontFamily: "'Syne', sans-serif", fontWeight: 800,
              fontSize: 18, color: 'var(--color-text-primary)',
            }}>
              {sec.title}
            </div>
          )}
          {sec.note && (
            <div style={{ padding: '0 20px 8px', fontSize: 14, lineHeight: 1.4, color: 'var(--color-text-muted)' }}>
              {sec.note}
            </div>
          )}
          {sec.rows.map(row => (
            <div key={row.key} style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px',
              borderBottom: '1px solid var(--color-border)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>
                  {row.label}
                </div>
                {row.desc && (
                  <div style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.35, marginTop: 2 }}>
                    {row.desc}
                  </div>
                )}
              </div>
              <Switch
                label={row.label}
                checked={!!values[row.key]}
                onChange={v => change(row.key, v)}
                disabled={busy === row.key}
              />
            </div>
          ))}
        </div>
      ))}

      {msg && (
        <div style={{
          position: 'fixed', left: '50%', transform: 'translateX(-50%)',
          bottom: 'calc(84px + env(safe-area-inset-bottom))', zIndex: 60,
          background: msg.ok ? 'var(--color-brand)' : 'var(--color-error)', color: 'white',
          borderRadius: 24, padding: '10px 18px', fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        }}>
          {msg.text}
        </div>
      )}
    </div>
  )
}

/* ── People you get post notifications from ───────────────────────────────── */

export function PostNotificationList({ initial }: { initial: PostNotificationTarget[] }) {
  const [people, setPeople] = useState(initial)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, start] = useTransition()

  function turnOff(p: PostNotificationTarget) {
    setBusyId(p.id)
    setError(null)
    start(async () => {
      const r = await disablePostNotificationsAction(p.id)
      setBusyId(null)
      if ('error' in r && r.error) { setError(r.error); return }
      setPeople(list => list.filter(x => x.id !== p.id))
    })
  }

  if (people.length === 0) {
    return (
      <div style={{ padding: '64px 32px', textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', background: 'var(--color-surface-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          color: 'var(--color-text-muted)',
        }}>
          <BellOff size={24} />
        </div>
        <h3 style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22,
          color: 'var(--color-text-primary)', margin: '0 0 8px',
        }}>
          No post notifications yet
        </h3>
        <p style={{ margin: '0 auto', maxWidth: 320, fontSize: 15, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
          Follow someone, then tap the bell on their profile to get notified when they post.
        </p>
      </div>
    )
  }

  return (
    <div>
      {error && (
        <div style={{ padding: '10px 20px', fontSize: 14, color: 'var(--color-error)' }}>{error}</div>
      )}
      {people.map(p => (
        <div key={p.id} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <Link href={`/user/${p.username}`} style={{ display: 'flex', flexShrink: 0 }}>
            <NotifAvatar name={p.display_name} url={p.avatar_url} size={44} />
          </Link>
          <Link href={`/user/${p.username}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}>
            <div style={{
              fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)',
              display: 'flex', alignItems: 'center', gap: 4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {p.display_name}
              {p.verification_tier && p.verification_tier !== 'none' && <VerifiedBadge tier={p.verification_tier} size={14} />}
            </div>
            <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>@{p.username}</div>
          </Link>
          <button
            onClick={() => turnOff(p)}
            disabled={busyId === p.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
              padding: '8px 16px', borderRadius: 20, cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--color-border-light)',
              color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif", opacity: busyId === p.id ? 0.6 : 1,
            }}
          >
            {busyId === p.id ? <Loader size={14} style={{ animation: 'nsSpin 0.8s linear infinite' }} /> : <BellOff size={14} />}
            Turn off
          </button>
        </div>
      ))}
      <style>{`@keyframes nsSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
