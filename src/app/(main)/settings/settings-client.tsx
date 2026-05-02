'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, LogOut, Shield, Bell, Globe, AlertTriangle,
  X, Check, User, Lock, Eye, EyeOff, Loader, Phone,
} from 'lucide-react'
import { signOutAction } from '@/lib/actions'
import {
  updateProfileAction,
  changeUsernameAction,
  changePasswordAction,
  deleteAccountAction,
} from '@/lib/actions/profiles'

type Panel = null | 'username' | 'password' | 'language'

interface SettingsProfile {
  id: string
  username: string
  display_name: string
  email?: string | null
  phone_number?: string | null
  is_private: boolean
  bvn_verified?: boolean
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

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  return (
    <p style={{
      padding: '24px 20px 8px',
      margin: 0,
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--color-text-faint)',
      letterSpacing: '0.09em',
      textTransform: 'uppercase',
    }}>
      {label}
    </p>
  )
}

// ── Icon box — uses surface-raised so it's always visible ────────────────────
function IconBox({ icon: Icon, danger = false }: { icon: any; danger?: boolean }) {
  return (
    <div style={{
      width: 34,
      height: 34,
      borderRadius: 9,
      flexShrink: 0,
      background: danger ? 'var(--color-error-muted)' : 'var(--color-surface-raised)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Icon
        size={15}
        color={danger ? 'var(--color-error)' : 'var(--color-text-secondary)'}
        strokeWidth={1.8}
      />
    </div>
  )
}

// ── Single row ────────────────────────────────────────────────────────────────
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
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 20px',
        borderBottom: last ? 'none' : '1px solid var(--color-border)',
        cursor: onClick ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent',
        background: 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-2)' }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      <IconBox icon={icon} danger={danger} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15,
          fontWeight: 500,
          color: danger ? 'var(--color-error)' : 'var(--color-text-primary)',
          lineHeight: 1.3,
        }}>
          {label}
        </div>
        {desc && (
          <div style={{
            fontSize: 13,
            color: accentDesc ? 'var(--color-brand)' : 'var(--color-text-muted)',
            marginTop: 2,
            lineHeight: 1.3,
          }}>
            {desc}
          </div>
        )}
      </div>

      {right ?? (onClick && <ChevronRight size={15} color="var(--color-text-faint)" />)}
    </div>
  )
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: checked ? 'var(--color-brand)' : 'var(--color-surface-3)',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        position: 'relative',
        flexShrink: 0,
        transition: 'background 0.2s',
        opacity: disabled ? 0.5 : 1,
        WebkitTapHighlightColor: 'transparent',
        padding: 0,
      }}
    >
      <span style={{
        display: 'block',
        position: 'absolute',
        top: 3,
        left: checked ? 23 : 3,
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: 'white',
        transition: 'left 0.18s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      }} />
    </button>
  )
}

// ── Inline expanded panel ─────────────────────────────────────────────────────
function Panel({ children }: { children: React.ReactNode }) {
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
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      color: 'var(--color-text-muted)',
      marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

// ── Card wrapper ─────────────────────────────────────────────────────────────
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
  const router = useRouter()
  const [panel,       setPanel]   = useState<Panel>(null)
  const [isPending,   startT]     = useTransition()
  const [flash,       setFlash]   = useState<{ text: string; ok: boolean } | null>(null)

  const [username,    setUsername]    = useState(profile.username)
  const [usernameErr, setUsernameErr] = useState('')
  const [newPass,   setNewPass]   = useState('')
  const [confPass,  setConfPass]  = useState('')
  const [showNew,   setShowNew]   = useState(false)
  const [showConf,  setShowConf]  = useState(false)
  const [passErr,   setPassErr]   = useState('')
  const [isPrivate,  setIsPrivate]  = useState(profile.is_private)
  const [notifPush,  setNotifPush]  = useState(profile.notif_push  ?? true)
  const [notifEmail, setNotifEmail] = useState(profile.notif_email ?? true)
  const [lang,       setLang]       = useState(profile.language_preference || 'en')
  const [showDelete,  setShowDelete]  = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting,    setDeleting]    = useState(false)

  function showFlash(text: string, ok = true) {
    setFlash({ text, ok })
    setTimeout(() => setFlash(null), 3000)
  }
  function togglePanel(p: Panel) { setPanel(prev => prev === p ? null : p) }

  function handleUsernameChange() {
    setUsernameErr('')
    startT(async () => {
      const r = await changeUsernameAction(username)
      if (r.error) { setUsernameErr(r.error); return }
      showFlash('Username updated')
      setPanel(null)
    })
  }

  function handlePasswordChange() {
    setPassErr('')
    startT(async () => {
      const r = await changePasswordAction(newPass, confPass)
      if (r.error) { setPassErr(r.error); return }
      showFlash('Password changed')
      setNewPass(''); setConfPass(''); setPanel(null)
    })
  }

  function togglePrivacy(val: boolean) {
    setIsPrivate(val)
    startT(async () => {
      const r = await updateProfileAction({ is_private: val })
      if (r.error) { setIsPrivate(!val); showFlash(r.error, false) }
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

  const passScore = [
    newPass.length >= 8,
    /[A-Z]/.test(newPass),
    /[0-9]/.test(newPass),
    /[^A-Za-z0-9]/.test(newPass),
  ].filter(Boolean).length

  const passColor = ['var(--color-error)', 'var(--color-error)', '#F59E0B', 'var(--color-brand)'][passScore - 1] || 'var(--color-border)'
  const passLabel = ['Weak', 'Fair', 'Good', 'Strong'][passScore - 1] || ''

  return (
    <div style={{ paddingBottom: 80, background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Flash toast */}
      {flash && (
        <div style={{
          position: 'fixed', top: 68, left: '50%', transform: 'translateX(-50%)',
          zIndex: 500,
          padding: '10px 18px',
          borderRadius: 10,
          background: flash.ok ? 'var(--color-brand)' : 'var(--color-error)',
          color: 'white',
          fontSize: 14, fontWeight: 600,
          fontFamily: "'Syne', sans-serif",
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          maxWidth: 'calc(100vw - 40px)',
        }}>
          {flash.ok ? <Check size={14} /> : <X size={14} />}
          {flash.text}
        </div>
      )}

      {/* ── ACCOUNT ──────────────────────────────────────────────────────── */}
      <SectionLabel label="Account" />
      <Card>
        <Row
          icon={User}
          label="Change username"
          desc={`@${profile.username}`}
          onClick={() => togglePanel('username')}
        />
        {panel === 'username' && (
          <Panel>
            <FieldLabel>New username</FieldLabel>
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <span style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--color-text-muted)', fontSize: 15, pointerEvents: 'none',
              }}>@</span>
              <input
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                maxLength={20}
                autoCapitalize="none"
                autoCorrect="off"
                className="para-input"
                style={{ paddingLeft: 28 }}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 14, marginTop: 4 }}>
              3–20 characters · Letters, numbers, underscores only
            </p>
            {usernameErr && (
              <p style={{ fontSize: 13, color: 'var(--color-error)', marginBottom: 10 }}>{usernameErr}</p>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleUsernameChange}
                disabled={isPending || username.length < 3 || username === profile.username}
                className="para-btn-primary"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                {isPending && <Loader size={14} style={{ animation: 'spin .7s linear infinite' }} />}
                {isPending ? 'Checking…' : 'Save username'}
              </button>
              <button
                onClick={() => { setPanel(null); setUsername(profile.username); setUsernameErr('') }}
                className="para-btn-ghost"
              >
                Cancel
              </button>
            </div>
          </Panel>
        )}

        {profile.email && (
          <Row icon={Shield} label="Email address" desc={profile.email} />
        )}

        <Row
          icon={Phone}
          label="Phone & BVN verification"
          desc={profile.bvn_verified ? 'Verified — withdrawals enabled' : 'Required to withdraw earnings'}
          accentDesc={!!profile.bvn_verified}
          onClick={() => router.push('/settings/verify-phone')}
        />

        <Row
          icon={Lock}
          label="Change password"
          desc="Update your account password"
          onClick={() => togglePanel('password')}
          last={panel !== 'password'}
        />
        {panel === 'password' && (
          <Panel>
            <FieldLabel>New password</FieldLabel>
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <input
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                type={showNew ? 'text' : 'password'}
                placeholder="Min 8 chars, 1 uppercase, 1 number"
                autoComplete="new-password"
                className="para-input"
                style={{ paddingRight: 44 }}
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
                  {[0,1,2,3].map(i => (
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

            <FieldLabel>Confirm password</FieldLabel>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <input
                value={confPass}
                onChange={e => setConfPass(e.target.value)}
                type={showConf ? 'text' : 'password'}
                placeholder="Repeat new password"
                autoComplete="new-password"
                className="para-input"
                style={{ paddingRight: 44 }}
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

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handlePasswordChange}
                disabled={isPending || newPass.length < 8 || confPass.length < 8}
                className="para-btn-primary"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                {isPending && <Loader size={14} style={{ animation: 'spin .7s linear infinite' }} />}
                {isPending ? 'Saving…' : 'Change password'}
              </button>
              <button
                onClick={() => { setPanel(null); setNewPass(''); setConfPass(''); setPassErr('') }}
                className="para-btn-ghost"
              >
                Cancel
              </button>
            </div>
          </Panel>
        )}
      </Card>

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
        <Row
          icon={Globe}
          label="Language"
          desc={LANGS.find(l => l.code === lang)?.label || 'English'}
          onClick={() => togglePanel('language')}
          last={panel !== 'language'}
        />
        {panel === 'language' && (
          <Panel>
            {LANGS.map((l, i) => (
              <button
                key={l.code}
                onClick={() => handleLang(l.code, l.label)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  width: '100%', padding: '13px 0',
                  background: 'none', border: 'none',
                  borderBottom: i < LANGS.length - 1 ? '1px solid var(--color-border)' : 'none',
                  cursor: 'pointer',
                  color: lang === l.code ? 'var(--color-brand)' : 'var(--color-text-primary)',
                  fontSize: 15,
                  fontFamily: "'DM Sans', sans-serif",
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {l.label}
                {lang === l.code && <Check size={15} color="var(--color-brand)" />}
              </button>
            ))}
          </Panel>
        )}
      </Card>

      {/* ── SESSION ──────────────────────────────────────────────────────── */}
      <SectionLabel label="Session" />
      <Card>
        <Row
          icon={LogOut}
          label={isPending ? 'Signing out…' : 'Sign out'}
          desc="Sign out of your Spup account"
          onClick={() => startT(async () => { await signOutAction() })}
          danger
          last
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
          danger
          last
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
                  fontFamily: 'monospace',
                  letterSpacing: '0.1em',
                  fontSize: 16,
                  borderColor: deleteInput.length > 0 && deleteInput !== 'DELETE'
                    ? 'var(--color-error)'
                    : undefined,
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
                    background: 'var(--color-error)',
                    border: 'none', borderRadius: 10,
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