// src/app/(auth)/forgot-password/page.tsx
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AuthCard, Alert } from '@/components/auth/form-field'
import { createBrowserClient } from '@/lib/supabase/client'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/language-context'
import { tRich } from '@/lib/i18n/rich'

const inp: React.CSSProperties = {
  width:'100%', background:'var(--input-bg)', border:'1px solid var(--color-border)',
  borderRadius:10, padding:'11px 14px', color:'var(--color-text-primary)', fontSize:15,
  outline:'none', fontFamily:"'DM Sans', sans-serif",
}

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [isPending, startT] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !email.includes('@')) { setError(t('auth.invalid_email')); return }
    setError('')
    startT(async () => {
      const supabase = createBrowserClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) setError(error.message)
      else setSent(true)
    })
  }

  if (sent) {
    return (
      <AuthCard title={t('auth.check_inbox_title')}>
        <div style={{ textAlign:'center', padding:'8px 0' }}>
          <div style={{ width:60, height:60, borderRadius:'50%', background:'var(--color-brand-muted)', border:'2px solid var(--color-brand-border)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
            <CheckCircle size={26} style={{ color: 'var(--color-brand)' }} />
          </div>
          <p style={{ fontSize:15, color:'var(--color-text-secondary)', lineHeight:1.6, marginBottom:24 }}>
            {tRich(t('auth.reset_link_sent'), { email: <strong style={{ color:'var(--color-text-primary)' }}>{email}</strong> })}
          </p>
          <Link href="/login" style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:14, color:'var(--color-brand)', textDecoration:'none', fontWeight:600 }}>
            <ArrowLeft size={14}/> {t('auth.back_to_signin')}
          </Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={t('auth.forgot_password_title')} subtitle={t('auth.forgot_password_desc')}>
      {error && <Alert type="error" message={error} />}
      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:12, color:'var(--color-text-secondary)', display:'block', marginBottom:6, fontWeight:500 }}>{t('auth.email_address')}</label>
          <input type="email" placeholder="you@email.com" value={email} onChange={e=>setEmail(e.target.value)} autoFocus autoComplete="email" inputMode="email" style={inp} />
        </div>
        <button type="submit" disabled={isPending} className="para-btn-primary">
          {isPending ? t('auth.sending') : t('auth.send_reset_link')}
        </button>
      </form>
      <div style={{ textAlign:'center', marginTop:20 }}>
        <Link href="/login" style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:14, color:'var(--color-text-secondary)', textDecoration:'none' }}>
          <ArrowLeft size={14}/> {t('auth.back_to_signin')}
        </Link>
      </div>
    </AuthCard>
  )
}