// src/app/(auth)/reset-password/page.tsx
'use client'

// forgot-password/page.tsx sends the reset email with
// redirectTo: `${origin}/reset-password` — this page is where that link
// lands. It didn't exist at all before, so the email went out fine but
// clicking it 404'd and the reset could never be completed.
//
// Supabase's browser client here uses the PKCE flow (see
// src/app/api/auth/callback/route.ts, which does the same exchange for
// OAuth), so the link arrives as /reset-password?code=... — that code is
// exchanged for a short-lived recovery session before updateUser() is
// allowed to change the password.

import { useState, useEffect, useTransition, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AuthCard, Alert } from '@/components/auth/form-field'
import { createBrowserClient } from '@/lib/supabase/client'
import { ArrowLeft, CheckCircle, Eye, EyeOff } from 'lucide-react'

const inp: React.CSSProperties = {
  width: '100%', background: '#131318', border: '1px solid #1E1E26',
  borderRadius: 10, padding: '11px 14px', color: '#F0F0EC', fontSize: 15,
  outline: 'none', fontFamily: "'DM Sans', sans-serif",
}

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Z]/.test(pw)) return 'Must contain at least one uppercase letter.'
  if (!/[0-9]/.test(pw)) return 'Must contain at least one number.'
  return null
}

function ResetPasswordForm() {
  const searchParams = useSearchParams()

  const [status, setStatus] = useState<'exchanging' | 'ready' | 'invalid'>(
    () => (searchParams.get('code') ? 'exchanging' : 'invalid')
  )
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [isPending, startT] = useTransition()

  // Exchange the recovery code for a session as soon as the page loads.
  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) return

    const supabase = createBrowserClient()
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      setStatus(error ? 'invalid' : 'ready')
    })
  }, [searchParams])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validatePassword(password)
    if (validationError) { setError(validationError); return }
    if (password !== confirm) { setError("Passwords don't match"); return }
    setError('')

    startT(async () => {
      const supabase = createBrowserClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) { setError(error.message); return }
      // Recovery session shouldn't stay active as a normal login — send
      // them back to sign in fresh with the new password.
      await supabase.auth.signOut()
      setDone(true)
    })
  }

  if (status === 'exchanging') {
    return (
      <AuthCard title="Reset password">
        <p style={{ fontSize: 15, color: '#6A6A60', textAlign: 'center' }}>Verifying your link…</p>
      </AuthCard>
    )
  }

  if (status === 'invalid') {
    return (
      <AuthCard title="Link expired">
        <p style={{ fontSize: 15, color: '#6A6A60', lineHeight: 1.6, textAlign: 'center', marginBottom: 24 }}>
          This password reset link is invalid or has expired. Request a new one to continue.
        </p>
        <Link href="/forgot-password" className="para-btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          Request a new link
        </Link>
      </AuthCard>
    )
  }

  if (done) {
    return (
      <AuthCard title="Password updated">
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(26,158,95,0.1)', border: '2px solid rgba(26,158,95,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <CheckCircle size={26} color="#1A9E5F" />
          </div>
          <p style={{ fontSize: 15, color: '#6A6A60', lineHeight: 1.6, marginBottom: 24 }}>
            Your password has been changed. Sign in with your new password.
          </p>
          <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#1A9E5F', textDecoration: 'none', fontWeight: 600 }}>
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Set a new password" subtitle="Choose a new password for your account">
      {error && <Alert type="error" message={error} />}
      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: '#8A8A85', display: 'block', marginBottom: 6, fontWeight: 500 }}>New password</label>
          <div style={{ position: 'relative' }}>
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              type={showPw ? 'text' : 'password'}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              autoFocus
              style={{ ...inp, paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#44444A', padding: 4 }}
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div style={{ marginBottom: 22 }}>
          <label style={{ fontSize: 12, color: '#8A8A85', display: 'block', marginBottom: 6, fontWeight: 500 }}>Confirm password</label>
          <input
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            type={showPw ? 'text' : 'password'}
            placeholder="Re-enter your password"
            autoComplete="new-password"
            style={inp}
          />
        </div>
        <button type="submit" disabled={isPending} className="para-btn-primary">
          {isPending ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </AuthCard>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
