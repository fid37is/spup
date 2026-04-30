// src/app/(auth)/login/page.tsx
'use client'

import React, { useState, useTransition, Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginSchema } from '@/lib/validations/schemas'
import { loginAction } from '@/lib/actions'
import { AuthCard, Alert } from '@/components/auth/form-field'
import OAuthButtons, { AuthDivider } from '@/components/auth/oauth-buttons'
import { useWaitlist } from '@/components/landing/waitlist-context'

const ENABLE_LOGIN = process.env.NEXT_PUBLIC_ENABLE_LOGIN === 'true'

const inp = (err?: string): React.CSSProperties => ({
  width: '100%',
  background: '#131318',
  border: `1px solid ${err ? '#E53935' : '#1E1E26'}`,
  borderRadius: 10,
  padding: '11px 14px',
  color: '#F0F0EC',
  fontSize: 15,
  outline: 'none',
  fontFamily: "'DM Sans', sans-serif",
})

const lbl: React.CSSProperties = {
  fontSize: 12,
  color: '#8A8A85',
  display: 'block',
  marginBottom: 6,
  fontWeight: 500,
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/feed'
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
      // On success loginAction redirects server-side — nothing to do here
    })
  }

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to your Spup account">
      {serverError && <Alert type="error" message={serverError} />}

      {/* Social auth */}
      <OAuthButtons mode="login" />
      <AuthDivider />

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* Email */}
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Email address</label>
          <input
            {...register('email')}
            type="email"
            placeholder="you@email.com"
            autoComplete="email"
            inputMode="email"
            autoFocus
            style={inp(errors.email?.message)}
          />
          {errors.email && (
            <p style={{ fontSize: 12, color: '#E53935', marginTop: 5 }}>
              {errors.email.message}
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
            <label style={{ ...lbl, marginBottom: 0 }}>Password</label>
            <Link
              href="/forgot-password"
              style={{
                fontSize: 12,
                color: '#1A9E5F',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              Forgot password?
            </Link>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              {...register('password')}
              type={showPw ? 'text' : 'password'}
              placeholder="Your password"
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
                color: '#44444A',
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
            <p style={{ fontSize: 12, color: '#E53935', marginTop: 5 }}>
              {errors.password.message}
            </p>
          )}
        </div>

        <button type="submit" disabled={isPending} className="para-btn-primary">
          {isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p
        style={{
          textAlign: 'center',
          fontSize: 14,
          color: '#44444A',
          marginTop: 20,
        }}
      >
        New to Spup?{' '}
        <Link
          href="/signup"
          style={{ color: '#1A9E5F', fontWeight: 600, textDecoration: 'none' }}
        >
          Create account
        </Link>
      </p>
    </AuthCard>
  )
}

function LoginPageInner() {
  const { openModal } = useWaitlist()

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
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Spup is in private beta</h1>
          <p style={{ fontSize: 15, color: '#8A8A85', maxWidth: 420, margin: '0 auto' }}>
            Login is disabled for now. Join the waitlist to be notified when we launch.
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