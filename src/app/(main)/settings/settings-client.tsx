'use client'

/**
 * SettingsClient
 * ───────────────
 * Account & preferences settings. Does NOT handle profile appearance
 * (name / bio / avatar / location) — those live in the EditProfileModal
 * opened from the profile page.
 *
 * Sections:
 *   Account    — username, email (display-only), phone/BVN, change password
 *   Privacy    — private account toggle
 *   Notifications — push / email toggles (stored in preferences)
 *   Appearance — language preference
 *   Session    — sign out
 *   Danger     — delete account (requires typing "DELETE" to confirm)
 */

import { useState, useTransition, useRef } from 'react'
import { useRouter }   from 'next/navigation'
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

// ── Types ─────────────────────────────────────────────────────────────────────
type Panel = null | 'username' | 'password' | 'language' | 'notifications'

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

// ── Input style ───────────────────────────────────────────────────────────────
const INP: React.CSSProperties = {
  width: '100%',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  padding: '12px 14px',
  color: 'var(--color-text-primary)',
  fontSize: 15,
  outline: 'none',
  fontFamily: "'DM Sans', sans-serif",
  transition: 'border-color 0.15s',
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{
      padding: '20px 20px 8px',
      fontSize: 11, fontWeight: 700,
      color: 'var(--color-text-muted)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    }}>{label}</div>
  )
}

function SettingsRow({
  icon: Icon, label, desc, onClick, danger = false, accent, last = false,
}: {
  icon: any; label: string; desc?: string
  onClick?: () => void; danger?: boolean; accent?: string; last?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        width: '100%', padding: '14px 20px',
        background: 'none', border: 'none',
        borderBottom: last ? 'none' : '1px solid var(--color-border)',
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left', transition: 'background 0.12s',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-2)' }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLButtonElement).style.background = '' }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: danger ? 'var(--color-error-muted)' : 'var(--color-surface-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={17} color={danger ? 'var(--color-error)' : (accent || 'var(--color-text-secondary)')} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, color: danger ? 'var(--color-error)' : 'var(--color-text-primary)', fontWeight: 500 }}>
          {label}
        </div>
        {desc && (
          <div style={{ fontSize: 13, color: accent || 'var(--color-text-muted)', marginTop: 2 }}>
            {desc}
          </div>
        )}
      </div>
      {onClick && <ChevronRight size={16} color="var(--color-border-light)" />}
    </button>
  )
}

function Toggle({
  checked, onChange, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 46, height: 26, borderRadius: 13,
        background: checked ? 'var(--color-brand)' : 'var(--color-surface-3)',
        border: 'none', cursor: disabled ? 'default' : 'pointer',
        position: 'relative', flexShrink: 0,
        transition: 'background 0.2s', opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 3,
        left: checked ? 23 : 3,
        width: 20, height: 20, borderRadius: '50%',
        background: 'white', transition: 'left 0.2s',
      }} />
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SettingsClient({ profile }: { profile: SettingsProfile }) {
  const router = useRouter()

  // panel state
  const [panel, setPanel] = useState<Panel>(null)

  // transient UI state
  const [isPending,   startT] = useTransition()
  const [flash, setFlash]     = useState<{ text: string; ok: boolean } | null>(null)

  // account fields
  const [username,    setUsername]    = useState(profile.username)
  const [usernameErr, setUsernameErr] = useState('')

  // password fields
  const [newPass,     setNewPass]     = useState('')
  const [confPass,    setConfPass]    = useState('')
  const [showNew,     setShowNew]     = useState(false)
  const [showConf,    setShowConf]    = useState(false)
  const [passErr,     setPassErr]     = useState('')

  // preferences
  const [isPrivate,   setIsPrivate]   = useState(profile.is_private)
  const [notifPush,   setNotifPush]   = useState(profile.notif_push ?? true)
  const [notifEmail,  setNotifEmail]  = useState(profile.notif_email ?? true)
  const [lang,        setLang]        = useState(profile.language_preference || 'en')

  // delete account
  const [showDelete,  setShowDelete]  = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting,    setDeleting]    = useState(false)

  // ── Flash helper ────────────────────────────────────────────────────────────
  function showFlash(text: string, ok = true) {
    setFlash({ text, ok })
    setTimeout(() => setFlash(null), 3200)
  }

  // ── Username save ───────────────────────────────────────────────────────────
  function handleUsernameChange() {
    setUsernameErr('')
    startT(async () => {
      const r = await changeUsernameAction(username)
      if (r.error) { setUsernameErr(r.error); return }
      showFlash('Username updated')
      setPanel(null)
    })
  }

  // ── Password save ───────────────────────────────────────────────────────────
  function handlePasswordChange() {
    setPassErr('')
    startT(async () => {
      const r = await changePasswordAction(newPass, confPass)
      if (r.error) { setPassErr(r.error); return }
      showFlash('Password changed successfully')
      setNewPass(''); setConfPass(''); setPanel(null)
    })
  }

  // ── Privacy toggle ──────────────────────────────────────────────────────────
  function togglePrivacy(val: boolean) {
    setIsPrivate(val)
    startT(async () => {
      const r = await updateProfileAction({ is_private: val })
      if (r.error) { setIsPrivate(!val); showFlash(r.error, false) }
    })
  }

  // ── Notification prefs ──────────────────────────────────────────────────────
  function handleNotifToggle(key: 'push' | 'email', val: boolean) {
    if (key === 'push')  setNotifPush(val)
    else                 setNotifEmail(val)
    startT(async () => {
      await updateProfileAction(
        key === 'push' ? { notif_push: val } as any : { notif_email: val } as any
      )
    })
  }

  // ── Language save ───────────────────────────────────────────────────────────
  function handleLangChange(code: string, label: string) {
    setLang(code)
    startT(async () => {
      await updateProfileAction({ language_preference: code as any })
      showFlash(`Language set to ${label}`)
      setPanel(null)
    })
  }

  // ── Delete account ──────────────────────────────────────────────────────────
  async function handleDeleteAccount() {
    if (deleteInput !== 'DELETE') return
    setDeleting(true)
    const r = await deleteAccountAction()
    if (r.error) { showFlash(r.error, false); setDeleting(false); return }
    // Auth row is gone — hard redirect to landing, no router.push
    window.location.replace('/')
  }

  return (
    <div style={{ paddingBottom: 80 }}>

      {/* Flash toast */}
      {flash && (
        <div style={{
          position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)',
          zIndex: 500,
          padding: '12px 20px', borderRadius: 12,
          background: flash.ok ? 'var(--color-brand)' : 'var(--color-error)',
          color: 'white',
          fontSize: 14, fontWeight: 600,
          fontFamily: "'Syne', sans-serif",
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          maxWidth: 'calc(100vw - 40px)',
        }}>
          {flash.ok ? <Check size={15} /> : <X size={15} />} {flash.text}
        </div>
      )}

      {/* ── ACCOUNT ─────────────────────────────────────────────────── */}
      <SectionLabel label="Account" />
      <div style={{ border: '1px solid var(--color-border)', borderLeft: 'none', borderRight: 'none' }}>

        {/* Username */}
        <SettingsRow
          icon={User}
          label="Change username"
          desc={`@${profile.username}`}
          onClick={() => setPanel(panel === 'username' ? null : 'username')}
        />

        {/* Username panel */}
        {panel === 'username' && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 8, letterSpacing: '0.04em' }}>
              NEW USERNAME
            </label>
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <span style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--color-text-muted)', pointerEvents: 'none',
              }}>@</span>
              <input
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                maxLength={20}
                autoCapitalize="none"
                autoCorrect="off"
                style={{ ...INP, paddingLeft: 30 }}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
              3–20 characters. Letters, numbers, underscores only.
            </p>
            {usernameErr && (
              <p style={{ fontSize: 13, color: 'var(--color-error)', marginBottom: 10 }}>{usernameErr}</p>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleUsernameChange}
                disabled={isPending || username.length < 3 || username === profile.username}
                style={{
                  flex: 1, padding: '11px 0', background: 'var(--color-brand)',
                  color: 'white', border: 'none', borderRadius: 10,
                  fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
                  cursor: isPending || username.length < 3 || username === profile.username ? 'not-allowed' : 'pointer',
                  opacity: isPending || username.length < 3 || username === profile.username ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {isPending ? <Loader size={14} style={{ animation: 'spin .7s linear infinite' }} /> : null}
                {isPending ? 'Checking…' : 'Save username'}
              </button>
              <button
                onClick={() => { setPanel(null); setUsername(profile.username); setUsernameErr('') }}
                style={{
                  padding: '11px 18px', background: 'var(--color-surface-3)',
                  border: '1px solid var(--color-border-light)',
                  borderRadius: 10, color: 'var(--color-text-secondary)',
                  cursor: 'pointer', fontSize: 14,
                }}
              >Cancel</button>
            </div>
          </div>
        )}

        {/* Email (display-only, no in-app change — managed through Supabase magic link/OTP) */}
        {profile.email && (
          <SettingsRow
            icon={Shield}
            label="Email address"
            desc={profile.email}
          />
        )}

        {/* Phone / BVN */}
        <SettingsRow
          icon={Phone}
          label="Phone & BVN verification"
          desc={profile.bvn_verified ? '✓ Verified — withdrawals enabled' : 'Required to withdraw earnings'}
          accent={profile.bvn_verified ? 'var(--color-brand)' : undefined}
          onClick={() => router.push('/settings/verify-phone')}
        />

        {/* Security / change password */}
        <SettingsRow
          icon={Lock}
          label="Security & password"
          desc="Change your password"
          onClick={() => setPanel(panel === 'password' ? null : 'password')}
          last
        />

        {/* Password panel */}
        {panel === 'password' && (
          <div style={{ padding: '16px 20px', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 8, letterSpacing: '0.04em' }}>
              NEW PASSWORD
            </label>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                type={showNew ? 'text' : 'password'}
                placeholder="At least 8 chars, 1 uppercase, 1 number"
                autoComplete="new-password"
                style={{ ...INP, paddingRight: 44 }}
              />
              <button
                onClick={() => setShowNew(v => !v)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-muted)', padding: 4,
                }}
              >
                {showNew ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 8, letterSpacing: '0.04em' }}>
              CONFIRM PASSWORD
            </label>
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <input
                value={confPass}
                onChange={e => setConfPass(e.target.value)}
                type={showConf ? 'text' : 'password'}
                placeholder="Repeat new password"
                autoComplete="new-password"
                style={{ ...INP, paddingRight: 44 }}
              />
              <button
                onClick={() => setShowConf(v => !v)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-muted)', padding: 4,
                }}
              >
                {showConf ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>

            {passErr && (
              <p style={{ fontSize: 13, color: 'var(--color-error)', marginBottom: 10 }}>{passErr}</p>
            )}

            {/* Simple strength indicator */}
            {newPass.length > 0 && (() => {
              const checks = [
                newPass.length >= 8,
                /[A-Z]/.test(newPass),
                /[0-9]/.test(newPass),
                /[^A-Za-z0-9]/.test(newPass),
              ]
              const score = checks.filter(Boolean).length
              const colors = ['#E53935','#F4511E','#FDD835','#1A9E5F']
              const labels = ['Weak','Fair','Good','Strong']
              return (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    {[0,1,2,3].map(i => (
                      <div key={i} style={{
                        flex: 1, height: 3, borderRadius: 2,
                        background: i < score ? colors[score - 1] : 'var(--color-border)',
                        transition: 'background 0.2s',
                      }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 12, color: colors[score - 1] || 'var(--color-text-muted)' }}>
                    {score > 0 ? labels[score - 1] : ''}
                  </span>
                </div>
              )
            })()}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handlePasswordChange}
                disabled={isPending || newPass.length < 8 || confPass.length < 8}
                style={{
                  flex: 1, padding: '11px 0', background: 'var(--color-brand)',
                  color: 'white', border: 'none', borderRadius: 10,
                  fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
                  cursor: isPending || newPass.length < 8 || confPass.length < 8 ? 'not-allowed' : 'pointer',
                  opacity: isPending || newPass.length < 8 || confPass.length < 8 ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {isPending ? <Loader size={14} style={{ animation: 'spin .7s linear infinite' }} /> : null}
                {isPending ? 'Saving…' : 'Change password'}
              </button>
              <button
                onClick={() => { setPanel(null); setNewPass(''); setConfPass(''); setPassErr('') }}
                style={{
                  padding: '11px 18px', background: 'var(--color-surface-3)',
                  border: '1px solid var(--color-border-light)',
                  borderRadius: 10, color: 'var(--color-text-secondary)',
                  cursor: 'pointer', fontSize: 14,
                }}
              >Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ── PRIVACY ─────────────────────────────────────────────────── */}
      <SectionLabel label="Privacy" />
      <div style={{ border: '1px solid var(--color-border)', borderLeft: 'none', borderRight: 'none' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 20px',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'var(--color-surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Eye size={17} color="var(--color-text-secondary)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, color: 'var(--color-text-primary)', fontWeight: 500 }}>
              Private account
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
              Only approved followers can see your posts
            </div>
          </div>
          <Toggle checked={isPrivate} onChange={togglePrivacy} disabled={isPending} />
        </div>
      </div>

      {/* ── NOTIFICATIONS ───────────────────────────────────────────── */}
      <SectionLabel label="Notifications" />
      <div style={{ border: '1px solid var(--color-border)', borderLeft: 'none', borderRight: 'none' }}>

        {[
          { key: 'push' as const,  icon: Bell, label: 'Push notifications', desc: 'Likes, replies, new followers',     val: notifPush  },
          { key: 'email' as const, icon: Bell, label: 'Email notifications', desc: 'Weekly digest & important alerts', val: notifEmail },
        ].map(({ key, icon: Icon, label, desc, val }, i, arr) => (
          <div key={key} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 20px',
            borderBottom: i < arr.length - 1 ? '1px solid var(--color-border)' : 'none',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'var(--color-surface-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={17} color="var(--color-text-secondary)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, color: 'var(--color-text-primary)', fontWeight: 500 }}>{label}</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>{desc}</div>
            </div>
            <Toggle checked={val} onChange={v => handleNotifToggle(key, v)} disabled={isPending} />
          </div>
        ))}
      </div>

      {/* ── APPEARANCE ──────────────────────────────────────────────── */}
      <SectionLabel label="Appearance" />
      <div style={{ border: '1px solid var(--color-border)', borderLeft: 'none', borderRight: 'none' }}>
        <SettingsRow
          icon={Globe}
          label="Language"
          desc={LANGS.find(l => l.code === lang)?.label || 'English'}
          onClick={() => setPanel(panel === 'language' ? null : 'language')}
          last
        />
        {panel === 'language' && (
          <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
            {LANGS.map((l, i) => (
              <button
                key={l.code}
                onClick={() => handleLangChange(l.code, l.label)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  width: '100%', padding: '14px 20px',
                  background: 'none', border: 'none',
                  borderBottom: i < LANGS.length - 1 ? '1px solid var(--color-border)' : 'none',
                  cursor: 'pointer',
                  color: lang === l.code ? 'var(--color-brand)' : 'var(--color-text-primary)',
                  fontSize: 15, fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {l.label}
                {lang === l.code && <Check size={16} color="var(--color-brand)" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── SESSION ─────────────────────────────────────────────────── */}
      <SectionLabel label="Session" />
      <div style={{ border: '1px solid var(--color-border)', borderLeft: 'none', borderRight: 'none' }}>
        <SettingsRow
          icon={LogOut}
          label={isPending ? 'Signing out…' : 'Sign out'}
          desc="Sign out of your Spup account"
          onClick={() => startT(async () => { await signOutAction() })}
          danger
          last
        />
      </div>

      {/* ── DANGER ZONE ─────────────────────────────────────────────── */}
      <SectionLabel label="Danger zone" />
      <div style={{ border: '1px solid var(--color-border)', borderLeft: 'none', borderRight: 'none' }}>
        <SettingsRow
          icon={AlertTriangle}
          label="Delete account"
          desc="Permanently delete your account and all data"
          onClick={() => setShowDelete(true)}
          danger
          last
        />
      </div>

      {/* ── Delete confirmation dialog ────────────────────────────────────── */}
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
                borderTopLeftRadius: 20, borderTopRightRadius: 20,
                padding: '28px 24px calc(28px + env(safe-area-inset-bottom))',
                width: '100%', maxWidth: 480,
                borderTop: '1px solid var(--color-border)',
              }}
            >
              <div style={{ fontSize: 28, textAlign: 'center', marginBottom: 12 }}>🗑️</div>
              <h3 style={{
                fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 19,
                color: 'var(--color-text-primary)', textAlign: 'center', marginBottom: 10,
              }}>Delete your account?</h3>

              <p style={{
                fontSize: 14, color: 'var(--color-text-secondary)',
                textAlign: 'center', lineHeight: 1.65, marginBottom: 20,
              }}>
                This <strong>permanently deletes</strong> your posts, followers, following,
                and any unwithdrawn wallet balance. This action cannot be undone.
              </p>

              <label style={{
                fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)',
                display: 'block', marginBottom: 8, letterSpacing: '0.04em',
              }}>
                TYPE <span style={{ color: 'var(--color-error)', fontFamily: 'monospace', letterSpacing: 0 }}>DELETE</span> TO CONFIRM
              </label>
              <input
                value={deleteInput}
                onChange={e => setDeleteInput(e.target.value)}
                placeholder="DELETE"
                autoCapitalize="characters"
                style={{
                  ...INP,
                  borderColor: deleteInput.length > 0 && deleteInput !== 'DELETE'
                    ? 'var(--color-error)'
                    : 'var(--color-border)',
                  marginBottom: 20,
                  fontFamily: 'monospace',
                  letterSpacing: '0.1em',
                  fontSize: 16,
                }}
              />

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => { setShowDelete(false); setDeleteInput('') }}
                  style={{
                    flex: 1, padding: 13,
                    background: 'var(--color-surface-3)',
                    border: '1px solid var(--color-border-light)',
                    borderRadius: 12,
                    color: 'var(--color-text-primary)',
                    cursor: 'pointer',
                    fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 15,
                  }}
                >Cancel</button>

                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteInput !== 'DELETE' || deleting}
                  style={{
                    flex: 1, padding: 13,
                    background: 'var(--color-error)',
                    border: 'none', borderRadius: 12,
                    color: 'white',
                    cursor: deleteInput !== 'DELETE' || deleting ? 'not-allowed' : 'pointer',
                    opacity: deleteInput !== 'DELETE' || deleting ? 0.45 : 1,
                    fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {deleting
                    ? <><Loader size={15} style={{ animation: 'spin .7s linear infinite' }} /> Deleting…</>
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