// src/app/(auth)/verify-email/page.tsx
'use client'

import { useState, useRef, useEffect, useTransition, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { verifyEmailOtpAction, resendEmailOtpAction } from '@/lib/actions'
import { AuthCard, Alert } from '@/components/auth/form-field'
import { Mail, CheckCircle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/language-context'
import { tRich } from '@/lib/i18n/rich'

function VerifyEmailForm() {
  const router = useRouter()
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''
  const isNewSignup = searchParams.get('new') !== 'false'

  const [digits, setDigits] = useState(['','','','','',''])
  const [error, setError] = useState('')
  const [resendMsg, setResendMsg] = useState('')
  const [countdown, setCountdown] = useState(60)
  const [verified, setVerified] = useState(false)
  const [isPending, startT] = useTransition()
  const [resendPending, setResendPending] = useState(false)
  const refs = useRef<(HTMLInputElement|null)[]>([])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  // Auto-focus first input
  useEffect(() => { refs.current[0]?.focus() }, [])

  function handleChange(i: number, val: string) {
    // Handle paste of full 6-digit code
    if (val.length === 6 && /^\d{6}$/.test(val)) {
      const arr = val.split('')
      setDigits(arr)
      refs.current[5]?.focus()
      submit(arr.join(''))
      return
    }
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = digit
    setDigits(next)
    if (digit && i < 5) refs.current[i + 1]?.focus()
    if (digit && i === 5 && next.join('').length === 6) submit(next.join(''))
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus()
    }
  }

  function submit(token: string) {
    setError('')
    startT(async () => {
      const r = await verifyEmailOtpAction(email, { token })
      if (r.error) {
        setError(r.error)
        setDigits(['','','','','',''])
        refs.current[0]?.focus()
      } else {
        setVerified(true)
        setTimeout(() => {
          router.push('/onboarding')
          router.refresh()
        }, 1200)
      }
    })
  }

  async function handleResend() {
    setResendPending(true)
    setError('')
    const r = await resendEmailOtpAction(email)
    setResendPending(false)
    if (r.error) { setError(r.error) }
    else { setResendMsg(t('auth.new_code_sent')); setCountdown(60); setTimeout(() => setResendMsg(''), 4000) }
  }

  if (verified) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ width:64, height:64, borderRadius:'50%', background:'rgba(26,158,95,0.1)', border:'2px solid rgba(26,158,95,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
          <CheckCircle size={28} color="#1A9E5F" />
        </div>
        <h2 style={{ fontFamily:"'Syne', sans-serif", fontWeight:800, fontSize:22, color:'#F0F0EC', marginBottom:8 }}>{t('auth.email_verified')}</h2>
        <p style={{ fontSize:15, color:'#6A6A60' }}>{t('auth.setting_up_account')}</p>
      </div>
    )
  }

  return (
    <AuthCard title={t('auth.check_inbox_title')} subtitle={t('auth.check_inbox_desc')}>

      {/* Email badge */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, background:'#131318', border:'1px solid #1E1E26', borderRadius:10, padding:'10px 16px', marginBottom:28 }}>
        <Mail size={14} color="#1A9E5F" />
        <span style={{ fontSize:14, color:'#8A8A85', fontFamily:"'DM Sans', sans-serif" }}>{email}</span>
      </div>

      {error && <Alert type="error" message={error} />}
      {resendMsg && <Alert type="success" message={resendMsg} />}

      {/* 6-box OTP input */}
      <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:28 }}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={el => { refs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={d}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            onFocus={e => e.target.select()}
            style={{
              width:52, height:60, textAlign:'center',
              fontSize:24, fontFamily:"'Syne', sans-serif", fontWeight:700,
              background: d ? 'rgba(26,158,95,0.08)' : '#131318',
              border: `2px solid ${d ? '#1A9E5F' : '#1E1E26'}`,
              borderRadius:12, color:'#F0F0EC', outline:'none',
              transition:'border-color 0.15s, background 0.15s',
            }}
          />
        ))}
      </div>

      {/* Verify button */}
      <button
        onClick={() => submit(digits.join(''))}
        disabled={digits.join('').length !== 6 || isPending}
        className="para-btn-primary"
        style={{ marginBottom:20 }}
      >
        {isPending ? t('auth.verifying') : t('auth.verify_email')}
      </button>

      {/* Resend */}
      <div style={{ textAlign:'center' }}>
        {countdown > 0 ? (
          <p style={{ fontSize:14, color:'#44444A' }}>
            {tRich(t('auth.resend_in'), { countdown: <span style={{ color:'#8A8A85', fontWeight:600 }}>{countdown}s</span> })}
          </p>
        ) : (
          <button onClick={handleResend} disabled={resendPending} style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, color:'#1A9E5F', fontWeight:600, fontFamily:"'DM Sans', sans-serif" }}>
            {resendPending ? t('auth.sending') : t('auth.resend_code')}
          </button>
        )}
      </div>

      <p style={{ textAlign:'center', fontSize:12, color:'#2A2A28', marginTop:20, lineHeight:1.6 }}>
        {t('auth.check_spam')}{' '}
        <a href="/signup" style={{ color:'#44444A', textDecoration:'underline' }}>{t('auth.wrong_email')}</a>
      </p>
    </AuthCard>
  )
}

export default function VerifyEmailPage() {
  return <Suspense><VerifyEmailForm /></Suspense>
}