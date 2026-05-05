// src/components/profile/account-settings-section.tsx
'use client'

/**
 * Account settings rendered on the owner's /profile page.
 * Contains: username, email (read-only), phone/BVN, change password.
 * Deliberately keeps the same UI primitives (Row, Panel, etc.) from settings.
 * No changes required to ProfileHeader or ProfileTabs.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, User, Shield, Phone, Lock,
  Eye, EyeOff, Loader, Check, X,
} from 'lucide-react'
import {
  changeUsernameAction,
  changePasswordAction,
} from '@/lib/actions/profiles'

interface AccountSettingsSectionProps {
  username: string
  email?: string | null
  phone_number?: string | null
  bvn_verified?: boolean
}

type Panel = null | 'username' | 'password'

// ── Primitives (self-contained, no external dependency) ───────────────────────

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
  icon, label, desc, onClick, accentDesc = false, last = false, right,
}: {
  icon: any; label: string; desc?: string
  onClick?: () => void; accentDesc?: boolean; last?: boolean
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
      <IconBox icon={icon} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>
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

export default function AccountSettingsSection({
  username: initialUsername,
  email,
  phone_number,
  bvn_verified,
}: AccountSettingsSectionProps) {
  const router = useRouter()
  const [panel,      setPanel]    = useState<Panel>(null)
  const [isPending,  startT]      = useTransition()
  const [flash,      setFlash]    = useState<{ text: string; ok: boolean } | null>(null)

  // Username state
  const [username,    setUsername]    = useState(initialUsername)
  const [usernameErr, setUsernameErr] = useState('')

  // Password state
  const [newPass,  setNewPass]  = useState('')
  const [confPass, setConfPass] = useState('')
  const [showNew,  setShowNew]  = useState(false)
  const [showConf, setShowConf] = useState(false)
  const [passErr,  setPassErr]  = useState('')

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
      router.refresh()
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

  // Password strength
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
    fontSize: 15, outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
    WebkitAppearance: 'none', appearance: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ borderTop: '8px solid var(--color-border)' }}>

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

      <SectionLabel label="Account" />
      <Card>

        {/* Username */}
        <Row
          icon={User}
          label="Change username"
          desc={`@${username}`}
          onClick={() => togglePanel('username')}
        />
        {panel === 'username' && (
          <InlinePanel>
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
                style={{ ...INP, paddingLeft: 28 }}
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
                disabled={isPending || username.length < 3 || username === initialUsername}
                className="para-btn-primary"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                {isPending && <Loader size={14} style={{ animation: 'spin .7s linear infinite' }} />}
                {isPending ? 'Checking…' : 'Save username'}
              </button>
              <button
                onClick={() => { setPanel(null); setUsername(initialUsername); setUsernameErr('') }}
                className="para-btn-ghost"
              >
                Cancel
              </button>
            </div>
          </InlinePanel>
        )}

        {/* Email — read-only */}
        {email && (
          <Row icon={Shield} label="Email address" desc={email} />
        )}

        {/* Phone & BVN */}
        <Row
          icon={Phone}
          label="Phone & BVN verification"
          desc={bvn_verified ? 'Verified — withdrawals enabled' : 'Required to withdraw earnings'}
          accentDesc={!!bvn_verified}
          onClick={() => router.push('/settings/verify-phone')}
        />

        {/* Password */}
        <Row
          icon={Lock}
          label="Change password"
          desc="Update your account password"
          onClick={() => togglePanel('password')}
          last={panel !== 'password'}
        />
        {panel === 'password' && (
          <InlinePanel>
            <FieldLabel>New password</FieldLabel>
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <input
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                type={showNew ? 'text' : 'password'}
                placeholder="Min 8 chars, 1 uppercase, 1 number"
                autoComplete="new-password"
                style={{ ...INP, paddingRight: 44 }}
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

            <FieldLabel>Confirm password</FieldLabel>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <input
                value={confPass}
                onChange={e => setConfPass(e.target.value)}
                type={showConf ? 'text' : 'password'}
                placeholder="Repeat new password"
                autoComplete="new-password"
                style={{ ...INP, paddingRight: 44 }}
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
          </InlinePanel>
        )}
      </Card>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}