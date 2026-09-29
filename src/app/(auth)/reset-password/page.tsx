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
import { useTranslation } from '@/lib/i18n/language-context'

const inp: React.CSSProperties = {
  width: '100%', background: '#131318', border: '1px solid #1E1E26',
  borderRadius: 10, padding: '11px 14px', color: '#F0F0EC', fontSize: 15,
  outline: 'none', fontFamily: "'DM Sans', sans-serif",
}

function validatePassword(pw: string, t: (key: string) => string): string | null {
  if (pw.length < 8) return t('auth.password_min_length_error')
  if (!/[A-Z]/.test(pw)) return t('auth.password_uppercase_error')
  if (!/[0-9]/.test(pw)) return t('auth.password_number_error')
  return null
}

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const { t } = useTranslation()

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
    const validationError = validatePassword(password, t)
    if (validationError) { setError(validationError); return }
    if (password !== confirm) { setError(t('auth.passwords_dont_match')); return }
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
      <AuthCard title={t('auth.reset_password_title')}>
        <p style={{ fontSize: 15, color: '#6A6A60', textAlign: 'center' }}>{t('auth.verifying_link')}</p>
      </AuthCard>
    )
  }

  if (status === 'invalid') {
    return (
      <AuthCard title={t('auth.link_expired')}>
        <p style={{ fontSize: 15, color: '#6A6A60', lineHeight: 1.6, textAlign: 'center', marginBottom: 24 }}>
          {t('auth.link_expired_body')}
        </p>
        <Link href="/forgot-password" className="para-btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          {t('auth.request_new_link')}
        </Link>
      </AuthCard>
    )
  }

  if (done) {
    return (
      <AuthCard title={t('auth.password_updated')}>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(26,158,95,0.1)', border: '2px solid rgba(26,158,95,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <CheckCircle size={26} color="#1A9E5F" />
          </div>
          <p style={{ fontSize: 15, color: '#6A6A60', lineHeight: 1.6, marginBottom: 24 }}>
            {t('auth.password_changed_body')}
          </p>
          <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#1A9E5F', textDecoration: 'none', fontWeight: 600 }}>
            <ArrowLeft size={14} /> {t('auth.back_to_signin')}
          </Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={t('auth.set_new_password_title')} subtitle={t('auth.set_new_password_desc')}>
      {error && <Alert type="error" message={error} />}
      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: '#8A8A85', display: 'block', marginBottom: 6, fontWeight: 500 }}>{t('auth.new_password')}</label>
          <div style={{ position: 'relative' }}>
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              type={showPw ? 'text' : 'password'}
              placeholder={t('auth.at_least_8_chars')}
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
          <label style={{ fontSize: 12, color: '#8A8A85', display: 'block', marginBottom: 6, fontWeight: 500 }}>{t('auth.confirm_password')}</label>
          <input
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            type={showPw ? 'text' : 'password'}
            placeholder={t('auth.reenter_password')}
            autoComplete="new-password"
            style={inp}
          />
        </div>
        <button type="submit" disabled={isPending} className="para-btn-primary">
          {isPending ? t('auth.updating') : t('auth.update_password')}
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
