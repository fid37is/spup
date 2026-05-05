'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, LogOut, Shield, Bell, Globe, AlertTriangle,
  X, Check, Eye, EyeOff, Loader, Moon, Sun,
} from 'lucide-react'
import { signOutAction } from '@/lib/actions'
import { updateProfileAction, deleteAccountAction } from '@/lib/actions/profiles'
import { useTheme } from '@/components/layout/theme-provider'

type Panel = null | 'language' | 'theme'

interface SettingsProfile {
  id: string
  is_private: boolean
  language_preference?: string
  notif_push?: boolean
  notif_email?: boolean
}

const LANGS = [
  { code: 'en',  label: 'English' },
  { code: 'pcm', label: 'Pidgin'  },
  { code: 'yo',  label: 'Yoruba'  },
  { code: 'ig',  label: 'Igbo'    },
  { code: 'ha',  label: 'Hausa'   },
]

// ── Shared primitives ─────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <p style={{
      padding: '24px 20px 8px', margin: 0,
      fontSize: 11, fontWeight: 700,
      color: 'var(--color-text-faint)',
      letterSpacing: '0.09em', textTransform: 'uppercase',
    }}>
      {label}
    </p>
  )
}

function IconBox({ icon: Icon, danger = false }: { icon: any; danger?: boolean }) {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 9, flexShrink: 0,
      background: danger ? 'var(--color-error-muted)' : 'var(--color-surface-raised)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon size={15} color={danger ? 'var(--color-error)' : 'var(--color-text-secondary)'} strokeWidth={1.8} />
    </div>
  )
}

function Row({
  icon, label, desc, onClick, danger = false, accentDesc = false, last = false, right,
}: {
  icon: any; label: string; desc?: string
  onClick?: () => void; danger?: boolean; accentDesc?: boolean; last?: boolean
  right?: React.ReactNode
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px',
        borderBottom: last ? 'none' : '1px solid var(--color-border)',
        cursor: onClick ? 'pointer' : 'default',
        background: 'transparent', transition: 'background 0.1s',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-2)' }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      <IconBox icon={icon} danger={danger} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 500,
          color: danger ? 'var(--color-error)' : 'var(--color-text-primary)',
          lineHeight: 1.3,
        }}>
          {label}
        </div>
        {desc && (
          <div style={{
            fontSize: 13, marginTop: 2, lineHeight: 1.3,
            color: accentDesc ? 'var(--color-brand)' : 'var(--color-text-muted)',
          }}>
            {desc}
          </div>
        )}
      </div>
      {right ?? (onClick && <ChevronRight size={15} color="var(--color-text-faint)" />)}
    </div>
  )
}

function Toggle({ checked, onChange, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      role="switch" aria-checked={checked}
      style={{
        width: 44, height: 24, borderRadius: 12,
        background: checked ? 'var(--color-brand)' : 'var(--color-surface-3)',
        border: 'none', cursor: disabled ? 'default' : 'pointer',
        position: 'relative', flexShrink: 0,
        transition: 'background 0.2s', opacity: disabled ? 0.5 : 1,
        WebkitTapHighlightColor: 'transparent', padding: 0,
      }}
    >
      <span style={{
        display: 'block', position: 'absolute',
        top: 3, left: checked ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: 'white', transition: 'left 0.18s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      }} />
    </button>
  )
}

function InlinePanel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '16px 20px 20px',
      borderBottom: '1px solid var(--color-border)',
      background: 'var(--color-surface-2)',
    }}>
      {children}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      borderTop: '1px solid var(--color-border)',
      borderBottom: '1px solid var(--color-border)',
    }}>
      {children}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SettingsClient({ profile }: { profile: SettingsProfile }) {
  const [panel,      setPanel]    = useState<Panel>(null)
  const [isPending,  startT]      = useTransition()
  const [flash,      setFlash]    = useState<{ text: string; ok: boolean } | null>(null)
  const [isPrivate,  setIsPrivate]  = useState(profile.is_private)
  const [notifPush,  setNotifPush]  = useState(profile.notif_push  ?? true)
  const [notifEmail, setNotifEmail] = useState(profile.notif_email ?? true)
  const [lang,       setLang]       = useState(profile.language_preference || 'en')
  const [showDelete,  setShowDelete]  = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting,    setDeleting]    = useState(false)

  const { theme, setTheme } = useTheme()

  function showFlash(text: string, ok = true) {
    setFlash({ text, ok })
    setTimeout(() => setFlash(null), 3000)
  }
  function togglePanel(p: Panel) { setPanel(prev => prev === p ? null : p) }

  function togglePrivacy(val: boolean) {
    setIsPrivate(val)
    startT(async () => {
      const r = await updateProfileAction({ is_private: val })
      if (r.error) { setIsPrivate(!val); showFlash(r.error, false) }
      else showFlash(val ? 'Account set to private' : 'Account set to public')
    })
  }

  function handleNotif(key: 'push' | 'email', val: boolean) {
    if (key === 'push') setNotifPush(val); else setNotifEmail(val)
    startT(async () => {
      await updateProfileAction(
        key === 'push' ? { notif_push: val } as any : { notif_email: val } as any
      )
    })
  }

  function handleLang(code: string, label: string) {
    setLang(code)
    startT(async () => {
      await updateProfileAction({ language_preference: code as any })
      showFlash(`Language set to ${label}`)
      setPanel(null)
    })
  }

  async function handleDeleteAccount() {
    if (deleteInput !== 'DELETE') return
    setDeleting(true)
    const r = await deleteAccountAction()
    if (r.error) { showFlash(r.error, false); setDeleting(false); return }
    window.location.replace('/')
  }

  const THEME_OPTIONS: { key: 'dark' | 'light'; label: string; Icon: any }[] = [
    { key: 'dark',  label: 'Dark',  Icon: Moon },
    { key: 'light', label: 'Light', Icon: Sun  },
  ]

  return (
    <div style={{ paddingBottom: 80, background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Flash toast */}
      {flash && (
        <div style={{
          position: 'fixed', top: 68, left: '50%', transform: 'translateX(-50%)',
          zIndex: 500, padding: '10px 18px', borderRadius: 10,
          background: flash.ok ? 'var(--color-brand)' : 'var(--color-error)',
          color: 'white', fontSize: 14, fontWeight: 600,
          fontFamily: "'Syne', sans-serif",
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          pointerEvents: 'none', whiteSpace: 'nowrap',
          maxWidth: 'calc(100vw - 40px)',
        }}>
          {flash.ok ? <Check size={14} /> : <X size={14} />}
          {flash.text}
        </div>
      )}

      {/* ── PRIVACY ──────────────────────────────────────────────────────── */}
      <SectionLabel label="Privacy" />
      <Card>
        <Row
          icon={Eye}
          label="Private account"
          desc="Only approved followers can see your posts"
          last
          right={<Toggle checked={isPrivate} onChange={togglePrivacy} disabled={isPending} />}
        />
      </Card>

      {/* ── NOTIFICATIONS ────────────────────────────────────────────────── */}
      <SectionLabel label="Notifications" />
      <Card>
        <Row
          icon={Bell}
          label="Push notifications"
          desc="Likes, replies, new followers"
          right={<Toggle checked={notifPush} onChange={v => handleNotif('push', v)} disabled={isPending} />}
        />
        <Row
          icon={Bell}
          label="Email notifications"
          desc="Weekly digest and important alerts"
          last
          right={<Toggle checked={notifEmail} onChange={v => handleNotif('email', v)} disabled={isPending} />}
        />
      </Card>

      {/* ── APPEARANCE ───────────────────────────────────────────────────── */}
      <SectionLabel label="Appearance" />
      <Card>
        {/* Theme */}
        <Row
          icon={Moon}
          label="Theme"
          desc={THEME_OPTIONS.find(t => t.key === theme)?.label || 'System default'}
          onClick={() => togglePanel('theme')}
          last={panel !== 'theme' && panel !== 'language'}
        />
        {panel === 'theme' && (
          <InlinePanel>
            {THEME_OPTIONS.map((opt, i) => (
              <button
                key={opt.key}
                onClick={() => { setTheme(opt.key); setPanel(null) }}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  width: '100%', padding: '13px 0', background: 'none', border: 'none',
                  borderBottom: i < THEME_OPTIONS.length - 1 ? '1px solid var(--color-border)' : 'none',
                  cursor: 'pointer',
                  color: theme === opt.key ? 'var(--color-brand)' : 'var(--color-text-primary)',
                  fontSize: 15, fontFamily: "'DM Sans', sans-serif",
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <opt.Icon size={15} />
                  {opt.label}
                </span>
                {theme === opt.key && <Check size={15} color="var(--color-brand)" />}
              </button>
            ))}
          </InlinePanel>
        )}

        {/* Language */}
        <Row
          icon={Globe}
          label="Language"
          desc={LANGS.find(l => l.code === lang)?.label || 'English'}
          onClick={() => togglePanel('language')}
          last={panel !== 'language'}
        />
        {panel === 'language' && (
          <InlinePanel>
            {LANGS.map((l, i) => (
              <button
                key={l.code}
                onClick={() => handleLang(l.code, l.label)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  width: '100%', padding: '13px 0', background: 'none', border: 'none',
                  borderBottom: i < LANGS.length - 1 ? '1px solid var(--color-border)' : 'none',
                  cursor: 'pointer',
                  color: lang === l.code ? 'var(--color-brand)' : 'var(--color-text-primary)',
                  fontSize: 15, fontFamily: "'DM Sans', sans-serif",
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {l.label}
                {lang === l.code && <Check size={15} color="var(--color-brand)" />}
              </button>
            ))}
          </InlinePanel>
        )}
      </Card>

      {/* ── SESSION ──────────────────────────────────────────────────────── */}
      <SectionLabel label="Session" />
      <Card>
        <Row
          icon={LogOut}
          label={isPending ? 'Signing out…' : 'Sign out'}
          desc="Sign out of your account"
          onClick={() => startT(async () => { await signOutAction() })}
          danger last
        />
      </Card>

      {/* ── DANGER ZONE ──────────────────────────────────────────────────── */}
      <SectionLabel label="Danger zone" />
      <Card>
        <Row
          icon={AlertTriangle}
          label="Delete account"
          desc="Permanently delete your account and all data"
          onClick={() => setShowDelete(true)}
          danger last
        />
      </Card>

      {/* ── Delete confirmation sheet ─────────────────────────────────────── */}
      {showDelete && (
        <>
          <div
            onClick={() => { setShowDelete(false); setDeleteInput('') }}
            style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'var(--overlay-bg)' }}
          />
          <div style={{
            position: 'fixed', inset: 0, zIndex: 401,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}>
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--color-surface)',
                borderTop: '1px solid var(--color-border)',
                borderTopLeftRadius: 20, borderTopRightRadius: 20,
                padding: `28px 24px calc(28px + env(safe-area-inset-bottom))`,
                width: '100%', maxWidth: 480,
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'var(--color-error-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <AlertTriangle size={20} color="var(--color-error)" strokeWidth={2} />
              </div>

              <h3 style={{
                fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18,
                color: 'var(--color-text-primary)', textAlign: 'center', marginBottom: 10,
              }}>
                Delete your account?
              </h3>

              <p style={{
                fontSize: 14, color: 'var(--color-text-secondary)',
                textAlign: 'center', lineHeight: 1.65, marginBottom: 24,
              }}>
                This permanently removes your posts, followers, following, and any unwithdrawn
                wallet balance. This action cannot be undone.
              </p>

              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.07em',
                color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 8,
              }}>
                Type{' '}
                <span style={{ color: 'var(--color-error)', fontFamily: 'monospace', letterSpacing: 0 }}>
                  DELETE
                </span>{' '}
                to confirm
              </div>
              <input
                value={deleteInput}
                onChange={e => setDeleteInput(e.target.value)}
                placeholder="DELETE"
                autoCapitalize="characters"
                className="para-input"
                style={{
                  marginBottom: 20,
                  fontFamily: 'monospace', letterSpacing: '0.1em', fontSize: 16,
                  borderColor: deleteInput.length > 0 && deleteInput !== 'DELETE'
                    ? 'var(--color-error)' : undefined,
                }}
              />

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => { setShowDelete(false); setDeleteInput('') }}
                  className="para-btn-ghost"
                  style={{ flex: 1, padding: '13px 0', fontSize: 15, fontFamily: "'Syne', sans-serif", fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteInput !== 'DELETE' || deleting}
                  style={{
                    flex: 1, padding: 13,
                    background: 'var(--color-error)', border: 'none', borderRadius: 10,
                    color: 'white',
                    cursor: deleteInput !== 'DELETE' || deleting ? 'not-allowed' : 'pointer',
                    opacity: deleteInput !== 'DELETE' || deleting ? 0.45 : 1,
                    fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {deleting
                    ? <><Loader size={14} style={{ animation: 'spin .7s linear infinite' }} /> Deleting…</>
                    : 'Delete forever'
                  }
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}