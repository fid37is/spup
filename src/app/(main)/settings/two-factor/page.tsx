// src/app/(main)/settings/two-factor/page.tsx
'use client'

import React, { useState, useEffect, CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ShieldCheck, ShieldOff, Loader, Check } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/client'

type Step = 'idle' | 'enrolling' | 'verifying' | 'enabled'

export default function TwoFactorPage() {
  const router    = useRouter()
  const supabase  = createBrowserClient()

  const [step,         setStep]        = useState<Step>('idle')
  const [qrUrl,        setQrUrl]       = useState('')
  const [secret,       setSecret]      = useState('')
  const [factorId,     setFactorId]    = useState('')
  const [challengeId,  setChallengeId] = useState('')
  const [code,         setCode]        = useState('')
  const [error,        setError]       = useState('')
  const [pageLoading,  setPageLoading] = useState(true)
  const [actionLoading,setActionLoading] = useState(false)
  const [isDisabling,  setIsDisabling] = useState(false)
  const [is2FAOn,      setIs2FAOn]     = useState(false)
  const [existingId,   setExistingId]  = useState('')

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }: { data: { totp?: { id: string; status: string }[] } | null }) => {
      const verified = data?.totp?.find((f: { id: string; status: string }) => f.status === 'verified')
      if (verified) { setIs2FAOn(true); setExistingId(verified.id) }
      setPageLoading(false)
    })
  }, [])

  async function startEnroll() {
    setError('')
    setStep('enrolling')
    const { data, error: err } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'Spup',
      friendlyName: 'Authenticator app',
    })
    if (err || !data) { setError(err?.message || 'Could not start setup.'); setStep('idle'); return }
    setFactorId(data.id)
    setQrUrl(data.totp.qr_code)
    setSecret(data.totp.secret)
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: data.id })
    if (chErr || !ch) { setError('Could not generate challenge.'); setStep('idle'); return }
    setChallengeId(ch.id)
    setStep('verifying')
  }

  async function verifyCode() {
    if (code.length !== 6) { setError('Enter the 6-digit code from your app.'); return }
    setError('')
    setActionLoading(true)
    const { error: err } = await supabase.auth.mfa.verify({ factorId, challengeId, code })
    setActionLoading(false)
    if (err) { setError('Incorrect code. Try again.'); return }
    setIs2FAOn(true)
    setStep('enabled')
  }

  async function disable2FA() {
    setError('')
    setIsDisabling(true)
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId: existingId })
    setIsDisabling(false)
    if (err) { setError(err.message); return }
    setIs2FAOn(false)
    setExistingId('')
    setStep('idle')
  }

  const INP: CSSProperties = {
    width: '100%', background: 'var(--input-bg)',
    border: '1px solid var(--color-border)', borderRadius: 10,
    padding: '12px 14px', color: 'var(--color-text-primary)',
    fontSize: 18, letterSpacing: '0.2em', textAlign: 'center',
    outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box',
  }

  const SPIN: CSSProperties = { animation: 'spin .7s linear infinite' }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--color-bg)' }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', background: 'var(--nav-bg)', borderBottom: '1px solid var(--color-border)', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12, height: 56 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '50%', color: 'var(--color-text-primary)' }}>
          <ArrowLeft size={20} />
        </button>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: 'var(--color-text-primary)', margin: 0 }}>
          Two-factor authentication
        </h1>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 20px' }}>

        {/* Loading */}
        {pageLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <Loader size={24} color="var(--color-brand)" style={SPIN} />
          </div>
        )}

        {/* 2FA is OFF — prompt to set up */}
        {!pageLoading && !is2FAOn && step === 'idle' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <ShieldOff size={28} color="var(--color-text-muted)" />
              </div>
              <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--color-text-primary)', marginBottom: 10 }}>2FA is off</h2>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.65 }}>
                Add an authenticator app (Google Authenticator, Authy, 1Password) to require a one-time code every time you sign in.
              </p>
            </div>
            <button onClick={startEnroll} style={{ width: '100%', padding: '14px 0', borderRadius: 24, border: 'none', background: 'var(--color-brand)', color: 'white', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>
              Set up authenticator app
            </button>
          </>
        )}

        {/* Generating QR */}
        {step === 'enrolling' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 60 }}>
            <Loader size={24} color="var(--color-brand)" style={SPIN} />
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Generating QR code…</p>
          </div>
        )}

        {/* Scan + verify */}
        {step === 'verifying' && (
          <>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--color-text-primary)', marginBottom: 8 }}>Scan this QR code</h2>
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.65, marginBottom: 24 }}>
              Open your authenticator app, scan the code below, then enter the 6-digit code it shows.
            </p>
            {qrUrl && (
              <div style={{ background: 'white', padding: 16, borderRadius: 14, display: 'inline-flex', marginBottom: 20 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUrl} alt="2FA QR code" width={180} height={180} />
              </div>
            )}
            <details style={{ marginBottom: 20 }}>
              <summary style={{ fontSize: 13, color: 'var(--color-text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                Can&apos;t scan? Enter this key manually
              </summary>
              <code style={{ display: 'block', marginTop: 8, padding: '10px 14px', background: 'var(--color-surface-2)', borderRadius: 8, fontSize: 13, letterSpacing: '0.1em', color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>
                {secret}
              </code>
            </details>
            <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block', marginBottom: 8 }}>
              One-time code
            </label>
            <input
              value={code}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              style={{ ...INP, marginBottom: 10 }}
            />
            {error && <p style={{ fontSize: 13, color: 'var(--color-error)', marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setStep('idle'); setCode(''); setError('') }} style={{ flex: 1, padding: '13px 0', borderRadius: 20, border: '1px solid var(--color-border)', background: 'none', color: 'var(--color-text-secondary)', fontFamily: "'Syne',sans-serif", fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={verifyCode} disabled={code.length !== 6 || actionLoading} style={{ flex: 1, padding: '13px 0', borderRadius: 20, border: 'none', background: code.length === 6 ? 'var(--color-brand)' : 'var(--color-surface-2)', color: code.length === 6 ? 'white' : 'var(--color-text-muted)', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, cursor: code.length === 6 ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {actionLoading && <Loader size={14} style={SPIN} />}
                {actionLoading ? 'Verifying…' : 'Verify & enable'}
              </button>
            </div>
          </>
        )}

        {/* Success */}
        {step === 'enabled' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(26,158,95,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Check size={28} color="var(--color-brand)" />
            </div>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--color-text-primary)', marginBottom: 10 }}>2FA enabled</h2>
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.65, marginBottom: 28 }}>
              Your account is now protected. You&apos;ll be asked for a one-time code each time you sign in.
            </p>
            <button onClick={() => router.back()} style={{ padding: '13px 32px', borderRadius: 24, border: 'none', background: 'var(--color-brand)', color: 'white', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              Done
            </button>
          </div>
        )}

        {/* 2FA is ON — option to disable */}
        {!pageLoading && is2FAOn && step === 'idle' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(26,158,95,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <ShieldCheck size={28} color="var(--color-brand)" />
              </div>
              <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--color-text-primary)', marginBottom: 10 }}>2FA is on</h2>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.65 }}>
                Your account is protected with an authenticator app. A one-time code is required each time you sign in.
              </p>
            </div>
            {error && <p style={{ fontSize: 13, color: 'var(--color-error)', textAlign: 'center', marginBottom: 16 }}>{error}</p>}
            <button onClick={disable2FA} disabled={isDisabling} style={{ width: '100%', padding: '14px 0', borderRadius: 24, border: '1px solid var(--color-error)', background: 'none', color: 'var(--color-error)', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, cursor: isDisabling ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isDisabling ? 0.6 : 1 }}>
              {isDisabling ? <Loader size={14} style={SPIN} /> : <ShieldOff size={16} />}
              {isDisabling ? 'Disabling…' : 'Disable 2FA'}
            </button>
          </>
        )}

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}