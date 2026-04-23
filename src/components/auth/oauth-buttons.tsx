// src/components/auth/oauth-buttons.tsx
'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'

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
  const [loading, setLoading] = useState<'google' | 'facebook' | null>(null)
  const [error, setError] = useState('')

  async function handleOAuth(provider: 'google' | 'facebook') {
    setLoading(provider)
    setError('')

    const supabase = createBrowserClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
        scopes: provider === 'google' ? 'email profile' : 'email public_profile',
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
    border: '1px solid #1E1E26', background: '#0D0D12',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif", color: '#F0F0EC',
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
        {mode === 'signup' ? 'Sign up with Google' : 'Continue with Google'}
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
        {mode === 'signup' ? 'Sign up with Facebook' : 'Continue with Facebook'}
      </button>

      {error && (
        <p style={{ fontSize: 13, color: '#E53935', marginTop: 10, textAlign: 'center' }}>{error}</p>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#F0F0EC', display: 'inline-block', animation: 'spin 0.7s linear infinite' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </span>
  )
}

export function AuthDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
      <div style={{ flex: 1, height: 1, background: '#1E1E26' }} />
      <span style={{ fontSize: 12, color: '#3A3A40', fontWeight: 500, letterSpacing: '0.06em' }}>OR</span>
      <div style={{ flex: 1, height: 1, background: '#1E1E26' }} />
    </div>
  )
}