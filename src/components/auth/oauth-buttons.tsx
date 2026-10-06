// src/components/auth/oauth-buttons.tsx
'use client'

import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { createBrowserClient } from '@/lib/supabase/client'
import { nativeGoogleAvailable, signInWithGoogleNative } from '@/lib/native-google'

// Set when the native Google sheet failed for a non-cancel reason. The error is
// shown on screen; the next tap then uses the browser flow instead.
let nativeGoogleFailed = false
import { useTranslation } from '@/lib/i18n/language-context'

const GOOGLE_ICON = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
  </svg>
)

const FACEBOOK_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.532-4.697 1.313 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.885v2.256h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073Z"/>
  </svg>
)

interface OAuthButtonsProps {
  mode: 'signup' | 'login'
}

export default function OAuthButtons({ mode }: OAuthButtonsProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState<'google' | 'facebook' | null>(null)
  const [error, setError] = useState('')

  async function handleOAuth(provider: 'google' | 'facebook') {
    setLoading(provider)
    setError('')

    const supabase = createBrowserClient()
    const scopes = provider === 'google' ? 'email profile' : 'email public_profile'
    // Always show Google's account chooser instead of silently reusing
    // whichever account the browser is already signed into.
    const queryParams = provider === 'google' ? { prompt: 'select_account' } : undefined

    // ── Native app (Capacitor) ──────────────────────────────────────────
    // Google refuses OAuth inside an embedded WebView, so open the system
    // browser (Chrome Custom Tab) instead. Supabase sends the user back to
    // the custom URL scheme below, which Android routes to the app;
    // NativeBootstrap catches it and finishes sign-in at /api/auth/callback.
    // The PKCE verifier cookie lives in this WebView, so the exchange works.
    if (Capacitor.isNativePlatform()) {
      // Google: use the native account sheet - no browser, no deep link.
      // If it is not configured (no NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID), or it
      // failed on the previous tap, use the browser flow below instead.
      if (provider === 'google' && nativeGoogleAvailable() && !nativeGoogleFailed) {
        const result = await signInWithGoogleNative(supabase)
        if (result.ok) {
          // The session now exists in this WebView. /api/auth/callback?native=1
          // runs the same profile / onboarding routing as the browser flow.
          window.location.assign('/api/auth/callback?native=1')
          return
        }
        if (result.cancelled) {
          setLoading(null)
          return
        }
        // Show the real reason instead of silently switching to the browser,
        // which is what made this look like "another popup, then Chrome".
        console.error('[spup-auth] native Google sign-in failed:', result.message)
        nativeGoogleFailed = true
        setError(`Google sign-in could not finish: ${result.message}. Tap again to try the browser sign-in instead.`)
        setLoading(null)
        return
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: 'com.spup.app://auth/callback',
          skipBrowserRedirect: true,
          scopes,
          queryParams,
        },
      })
      if (error || !data?.url) {
        setError(error?.message ?? 'Could not start sign in')
        setLoading(null)
        return
      }
      try {
        const { Browser } = await import('@capacitor/browser')
        await Browser.open({ url: data.url })
      } catch {
        setError('Could not open the sign-in page')
      }
      // Reset the spinner so the buttons work again if the user backs out
      // of the browser without finishing.
      setLoading(null)
      return
    }

    // ── Web ─────────────────────────────────────────────────────────────
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
        scopes,
        queryParams,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(null)
    }
    // On success Supabase redirects the browser — no need to setLoading(null)
  }

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    width: '100%', padding: '12px 20px', borderRadius: 10,
    border: '1px solid var(--color-border)', background: 'var(--color-surface)',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif", color: 'var(--color-text-primary)',
    transition: 'background 0.15s, border-color 0.15s',
    marginBottom: 10,
  }

  return (
    <div>
      {/* Google */}
      <button
        type="button"
        onClick={() => handleOAuth('google')}
        disabled={!!loading}
        style={{ ...btnBase, opacity: loading && loading !== 'google' ? 0.5 : 1 }}
      >
        {loading === 'google' ? (
          <Spinner />
        ) : GOOGLE_ICON}
        {mode === 'signup' ? t('auth.signup_google') : t('auth.continue_google')}
      </button>

      {/* Facebook */}
      <button
        type="button"
        onClick={() => handleOAuth('facebook')}
        disabled={!!loading}
        style={{ ...btnBase, marginBottom: 0, opacity: loading && loading !== 'facebook' ? 0.5 : 1 }}
      >
        {loading === 'facebook' ? (
          <Spinner />
        ) : FACEBOOK_ICON}
        {mode === 'signup' ? t('auth.signup_facebook') : t('auth.continue_facebook')}
      </button>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--color-error)', marginTop: 10, textAlign: 'center' }}>{error}</p>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--color-border-light)', borderTopColor: 'var(--color-text-primary)', display: 'inline-block', animation: 'spin 0.7s linear infinite' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </span>
  )
}

export function AuthDivider() {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500, letterSpacing: '0.06em' }}>{t('auth.or')}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
    </div>
  )
}