// src/app/(auth)/login/page.tsx
'use client'

import React, { useState, useTransition, Suspense, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginSchema } from '@/lib/validations/schemas'
import { loginAction } from '@/lib/actions'
import { AuthCard, Alert } from '@/components/auth/form-field'
import OAuthButtons, { AuthDivider } from '@/components/auth/oauth-buttons'
import { useWaitlist } from '@/components/landing/waitlist-context'
import { useTranslation } from '@/lib/i18n/language-context'
import { tv } from '@/lib/i18n/validation'

const ENABLE_LOGIN = process.env.NEXT_PUBLIC_ENABLE_LOGIN === 'true'

const inp = (err?: string): React.CSSProperties => ({
  width: '100%',
  background: 'var(--input-bg)',
  border: `1px solid ${err ? 'var(--color-error)' : 'var(--color-border)'}`,
  borderRadius: 10,
  padding: '11px 14px',
  color: 'var(--color-text-primary)',
  fontSize: 15,
  outline: 'none',
  fontFamily: "'DM Sans', sans-serif",
})

const lbl: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-text-secondary)',
  display: 'block',
  marginBottom: 6,
  fontWeight: 500,
}

function LoginForm() {
  const router = useRouter()
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/feed'

  // proxy.ts's cross-domain identity guard bounces a mismatched session
  // (admin on main domain, or vice versa) back here with ?error=... -
  // surface that as the same Alert a failed sign-in attempt would show.
  const hostErrorParam = searchParams.get('error')
  // /api/auth/callback adds ?reason=... saying why a Google/Facebook sign-in failed.
  const reasonParam = searchParams.get('reason')
  const hostErrorMessage = useMemo(() => {
    if (hostErrorParam === 'admin_only') return t('auth.admin_only_notice')
    if (hostErrorParam === 'use_admin_domain') return t('auth.admin_only_desc')
    // Before this, a failed Google/Facebook sign-in landed here with nothing
    // shown at all - the page just looked like it had ignored the tap.
    if (hostErrorParam === 'auth_failed') {
      return `Sign-in did not finish. Please try again.${reasonParam ? ` (${reasonParam})` : ''}`
    }
    if (hostErrorParam === 'no_code') {
      return `Sign-in was interrupted before it finished. Please try again.${reasonParam ? ` (${reasonParam})` : ''}`
    }
    return ''
  }, [hostErrorParam, reasonParam, t])

  const [serverError, setServerError] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [isPending, startT] = useTransition()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginSchema>({ resolver: zodResolver(loginSchema) })

  function onSubmit(data: LoginSchema) {
    setServerError('')
    startT(async () => {
      const r = await loginAction(data, redirectTo)
      if (r?.error) {
        if ('needsVerification' in r && r.needsVerification && r.email) {
          router.push(`/verify-email?email=${encodeURIComponent(r.email as string)}`)
          return
        }
        setServerError(r.error)
      }
      // On success loginAction redirects server-side - nothing to do here
    })
  }

  return (
    <AuthCard title={t('auth.welcome_back')} subtitle={t('auth.signin_subtitle')}>
      {(serverError || hostErrorMessage) && <Alert type="error" message={serverError || hostErrorMessage} />}

      {/* Social auth */}
      <OAuthButtons mode="login" />
      <AuthDivider />

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* Email or username */}
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>{t('auth.email_or_username')}</label>
          <input
            {...register('identifier')}
            type="text"
            placeholder={t('auth.email_or_username_placeholder')}
            autoComplete="username"
            autoFocus
            style={inp(errors.identifier?.message)}
          />
          {errors.identifier && (
            <p style={{ fontSize: 12, color: 'var(--color-error)', marginTop: 5 }}>
              {tv(t, errors.identifier.message)}
            </p>
          )}
        </div>

        {/* Password */}
        <div style={{ marginBottom: 22 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
            }}
          >
            <label style={{ ...lbl, marginBottom: 0 }}>{t('auth.password')}</label>
            <Link
              href="/forgot-password"
              style={{
                fontSize: 12,
                color: 'var(--color-brand)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              {t('auth.forgot_password_title')}
            </Link>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              {...register('password')}
              type={showPw ? 'text' : 'password'}
              placeholder={t('auth.your_password')}
              autoComplete="current-password"
              style={{ ...inp(errors.password?.message), paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              style={{
                position: 'absolute',
                right: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                padding: 4,
              }}
            >
              {showPw ? (
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {errors.password && (
            <p style={{ fontSize: 12, color: 'var(--color-error)', marginTop: 5 }}>
              {tv(t, errors.password.message)}
            </p>
          )}
        </div>

        <button type="submit" disabled={isPending} className="para-btn-primary">
          {isPending ? t('auth.signing_in') : t('auth.sign_in')}
        </button>
      </form>

      <p
        style={{
          textAlign: 'center',
          fontSize: 14,
          color: 'var(--color-text-secondary)',
          marginTop: 20,
        }}
      >
        {t('auth.new_to_spup')}{' '}
        <Link
          href="/signup"
          style={{ color: 'var(--color-brand)', fontWeight: 600, textDecoration: 'none' }}
        >
          {t('auth.create_account')}
        </Link>
      </p>
    </AuthCard>
  )
}

function LoginPageInner() {
  const { openModal } = useWaitlist()
  const { t } = useTranslation()

  useEffect(() => {
    if (!ENABLE_LOGIN) {
      openModal()
    }
  }, [openModal])

  if (!ENABLE_LOGIN) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>{t('auth.beta_title')}</h1>
          <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', maxWidth: 420, margin: '0 auto' }}>
            {t('auth.beta_desc')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

export default function LoginPage() {
  return <LoginPageInner />
}