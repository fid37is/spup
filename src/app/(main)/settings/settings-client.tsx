'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, LogOut, Shield, Bell, Globe, AlertTriangle, Lock,
  X, Check, Eye, EyeOff, Loader, Moon, Sun, Play,
} from 'lucide-react'
import { signOutAction } from '@/lib/actions'
import { updateProfileAction, deleteAccountAction, changePasswordAction } from '@/lib/actions/profiles'
import { useTheme } from '@/components/layout/theme-provider'
import { createBrowserClient } from '@/lib/supabase/client'

type Panel = null | 'language' | 'theme' | 'password' | 'autoplay'

interface SettingsProfile {
  id: string
  is_private: boolean
  language_preference?: string
  notif_push?: boolean
  notif_email?: boolean
  autoplay_preference?: string
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.07em',
      textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 8,
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
  const [autoplay,   setAutoplay]   = useState(profile.autoplay_preference || 'wifi')
  const [showDelete,  setShowDelete]  = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting,    setDeleting]    = useState(false)

  const router = useRouter()
  const { theme, setTheme } = useTheme()

  // Password state
  const [oldPass,  setOldPass]  = useState('')
  const [newPass,  setNewPass]  = useState('')
  const [confPass, setConfPass] = useState('')
  const [showOld,  setShowOld]  = useState(false)
  const [showNew,  setShowNew]  = useState(false)
  const [showConf, setShowConf] = useState(false)
  const [passErr,  setPassErr]  = useState('')
  const [deletePass, setDeletePass] = useState('')
  const [deletePassErr, setDeletePassErr] = useState('')

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

  async function handlePasswordChange() {
    setPassErr('')
    const r = await changePasswordAction(oldPass, newPass, confPass)
    if ('error' in r && r.error) { setPassErr(r.error); showFlash(r.error, false); return }
    showFlash('Password changed successfully')
    setOldPass(''); setNewPass(''); setConfPass(''); setPanel(null)
  }

  const passScore = [
    newPass.length >= 8,
    /[A-Z]/.test(newPass),
    /[0-9]/.test(newPass),
    /[^A-Za-z0-9]/.test(newPass),
  ].filter(Boolean).length
  const passColor = ['var(--color-error)', 'var(--color-error)', '#F59E0B', 'var(--color-brand)'][passScore - 1] || 'var(--color-border)'
  const passLabel = ['Weak', 'Fair', 'Good', 'Strong'][passScore - 1] || ''

  const INP: React.CSSProperties = {
    width: '100%', background: 'var(--input-bg)',
    border: '1px solid var(--color-border)', borderRadius: 10,
    padding: '10px 13px', color: 'var(--color-text-primary)',
    fontSize: 15, outline: 'none', paddingRight: 44,
    fontFamily: "'DM Sans', sans-serif",
    WebkitAppearance: 'none', appearance: 'none', boxSizing: 'border-box',
  }

  function handleLang(code: string, label: string) {
    setLang(code)
    startT(async () => {
      await updateProfileAction({ language_preference: code as any })
      showFlash(`Language set to ${label}`)
      setPanel(null)
    })
  }

  function handleAutoplay(value: string, label: string) {
    setAutoplay(value)
    if (typeof window !== 'undefined') localStorage.setItem('spup_autoplay', value)
    startT(async () => {
      await updateProfileAction({ autoplay_preference: value } as any)
      showFlash(`Autoplay set to ${label}`)
      setPanel(null)
    })
  }

  async function handleDeleteAccount() {
    if (deleteInput !== 'DELETE' || !deletePass) return
    setDeletePassErr('')
    setDeleting(true)

    // Re-authenticate before deleting
    const browser = createBrowserClient()
    const { data: { user: authUser } } = await browser.auth.getUser()
    if (!authUser?.email) { setDeletePassErr('Session expired. Please log in again.'); setDeleting(false); return }

    const { error: authErr } = await browser.auth.signInWithPassword({ email: authUser.email, password: deletePass })
    if (authErr) { setDeletePassErr('Incorrect password.'); setDeleting(false); return }

    const r = await deleteAccountAction()
    if (r.error) { showFlash(r.error, false); setDeleting(false); return }
    window.location.replace('/')
  }

  const AUTOPLAY_OPTIONS = [
    { value: 'always', label: 'Always',        desc: 'Wi-Fi and mobile data' },
    { value: 'wifi',   label: 'Wi-Fi only',    desc: 'Pause on mobile data'  },
    { value: 'never',  label: 'Off',           desc: 'Never autoplay videos' },
  ]

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
          desc={isPrivate ? 'Private — followers must be approved' : 'Public — anyone can follow and see your posts'}
          accentDesc={isPrivate}
          last={!isPrivate}
          right={<Toggle checked={isPrivate} onChange={togglePrivacy} disabled={isPending} />}
        />
        {isPrivate && (
          <div style={{
            padding: '12px 20px 14px',
            background: 'var(--color-surface-2)',
            borderTop: '1px solid var(--color-border)',
            fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6,
          }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>What this means: </span>
            New followers must send a request that you approve. Existing followers are unaffected.
            Your posts, replies, and likes are hidden from non-followers.
          </div>
        )}
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

      {/* ── VIDEO ───────────────────────────────────────────────────────── */}
      <SectionLabel label="Video" />
      <Card>
        <Row
          icon={Play}
          label="Autoplay videos"
          desc={AUTOPLAY_OPTIONS.find(o => o.value === autoplay)?.label || 'Wi-Fi only'}
          onClick={() => togglePanel('autoplay')}
          last={panel !== 'autoplay'}
        />
        {panel === 'autoplay' && (
          <InlinePanel>
            {AUTOPLAY_OPTIONS.map((opt, i) => (
              <button
                key={opt.value}
                onClick={() => handleAutoplay(opt.value, opt.label)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  width: '100%', padding: '13px 0', background: 'none', border: 'none',
                  borderBottom: i < AUTOPLAY_OPTIONS.length - 1 ? '1px solid var(--color-border)' : 'none',
                  cursor: 'pointer',
                  color: autoplay === opt.value ? 'var(--color-brand)' : 'var(--color-text-primary)',
                  fontSize: 15, fontFamily: "'DM Sans', sans-serif",
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <span>{opt.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{opt.desc}</span>
                </span>
                {autoplay === opt.value && <Check size={15} color="var(--color-brand)" />}
              </button>
            ))}
          </InlinePanel>
        )}
      </Card>

      {/* ── SECURITY ─────────────────────────────────────────────────────── */}
      <SectionLabel label="Security" />
      <Card>
        <Row
          icon={Lock}
          label="Change password"
          desc="Update your account password"
          onClick={() => togglePanel('password')}
          last={panel !== 'password'}
        />
        {panel === 'password' && (
          <InlinePanel>
            <FieldLabel>Current password</FieldLabel>
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <input
                value={oldPass}
                onChange={e => setOldPass(e.target.value)}
                type={showOld ? 'text' : 'password'}
                placeholder="Your current password"
                autoComplete="current-password"
                style={INP}
              />
              <button onClick={() => setShowOld(v => !v)} style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-muted)', padding: 4, display: 'flex',
              }}>
                {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <FieldLabel>New password</FieldLabel>
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <input
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                type={showNew ? 'text' : 'password'}
                placeholder="Min 8 chars, 1 uppercase, 1 number"
                autoComplete="new-password"
                style={INP}
              />
              <button onClick={() => setShowNew(v => !v)} style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-muted)', padding: 4, display: 'flex',
              }}>
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {newPass.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: i < passScore ? passColor : 'var(--color-border)',
                      transition: 'background 0.2s',
                    }} />
                  ))}
                </div>
                {passLabel && <span style={{ fontSize: 12, color: passColor }}>{passLabel}</span>}
              </div>
            )}

            <FieldLabel>Confirm new password</FieldLabel>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <input
                value={confPass}
                onChange={e => setConfPass(e.target.value)}
                type={showConf ? 'text' : 'password'}
                placeholder="Repeat new password"
                autoComplete="new-password"
                style={INP}
              />
              <button onClick={() => setShowConf(v => !v)} style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-muted)', padding: 4, display: 'flex',
              }}>
                {showConf ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {passErr && <p style={{ fontSize: 13, color: 'var(--color-error)', marginBottom: 12 }}>{passErr}</p>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                onClick={() => { setPanel(null); setOldPass(''); setNewPass(''); setConfPass(''); setPassErr('') }}
                style={{ padding: '9px 18px', borderRadius: 20, border: '1px solid var(--color-border)', background: 'none', color: 'var(--color-text-secondary)', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordChange}
                disabled={!oldPass || newPass.length < 8 || confPass.length < 8}
                style={{ padding: '9px 20px', borderRadius: 20, border: 'none', background: 'var(--color-brand)', color: 'white', fontSize: 14, fontWeight: 700, cursor: !oldPass || newPass.length < 8 || confPass.length < 8 ? 'not-allowed' : 'pointer', opacity: !oldPass || newPass.length < 8 || confPass.length < 8 ? 0.5 : 1, fontFamily: "'Syne',sans-serif", display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {isPending && <Loader size={14} style={{ animation: 'spin .7s linear infinite' }} />}
                {isPending ? 'Saving…' : 'Update'}
              </button>
            </div>
          </InlinePanel>
        )}
        <Row
          icon={Shield}
          label="Two-factor authentication"
          desc="Add an extra layer of security to your account"
          onClick={() => router.push('/settings/two-factor')}
          last
        />
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
            onClick={() => { setShowDelete(false); setDeleteInput(''); setDeletePass(''); setDeletePassErr('') }}
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

              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                Enter your password to confirm
              </div>
              <input
                type="password"
                value={deletePass}
                onChange={e => { setDeletePass(e.target.value); setDeletePassErr('') }}
                placeholder="Your current password"
                autoComplete="current-password"
                style={{
                  width: '100%', background: 'var(--input-bg)',
                  border: `1px solid ${deletePassErr ? 'var(--color-error)' : 'var(--color-border)'}`,
                  borderRadius: 10, padding: '10px 13px',
                  color: 'var(--color-text-primary)', fontSize: 15,
                  outline: 'none', fontFamily: "'DM Sans',sans-serif",
                  boxSizing: 'border-box', marginBottom: 8,
                }}
              />
              {deletePassErr && <p style={{ fontSize: 13, color: 'var(--color-error)', marginBottom: 10 }}>{deletePassErr}</p>}

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
                  onClick={() => { setShowDelete(false); setDeleteInput(''); setDeletePass(''); setDeletePassErr('') }}
                  className="para-btn-ghost"
                  style={{ flex: 1, padding: '13px 0', fontSize: 15, fontFamily: "'Syne', sans-serif", fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteInput !== 'DELETE' || !deletePass || deleting}
                  style={{
                    flex: 1, padding: 13,
                    background: 'var(--color-error)', border: 'none', borderRadius: 10,
                    color: 'white',
                    cursor: deleteInput !== 'DELETE' || !deletePass || deleting ? 'not-allowed' : 'pointer',
                    opacity: deleteInput !== 'DELETE' || !deletePass || deleting ? 0.45 : 1,
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