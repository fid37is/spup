// src/app/(main)/settings/verify-phone/page.tsx
'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendPhoneOtpAction, verifyPhoneOtpAction, resendPhoneOtpAction } from '@/lib/actions/phone-kyc'
import { ArrowLeft, Phone, CheckCircle, Shield } from 'lucide-react'
import Link from 'next/link'

const INP: React.CSSProperties = {
  width: '100%', background: '#131318', border: '1px solid #1E1E26',
  borderRadius: 10, padding: '12px 14px', color: '#F0F0EC', fontSize: 15,
  outline: 'none', fontFamily: "'DM Sans', sans-serif",
  transition: 'border-color 0.15s',
}

function toDisplay(e164: string) {
  return e164.replace('+234', '0').replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3')
}

type Stage = 'enter-phone' | 'enter-otp' | 'success'

export default function VerifyPhonePage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('enter-phone')
  const [phone, setPhone]     = useState('')
  const [e164Phone, setE164]  = useState('')
  const [digits, setDigits]   = useState(['', '', '', '', '', ''])
  const [error, setError]     = useState('')
  const [resendMsg, setResendMsg] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [isPending, startT]   = useTransition()
  const [resendPending, setResendPending] = useState(false)
  const refs = useRef<(HTMLInputElement | null)[]>([])

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  // Auto-focus first OTP box when stage changes
  useEffect(() => {
    if (stage === 'enter-otp') {
      setTimeout(() => refs.current[0]?.focus(), 100)
    }
  }, [stage])

  // ── Send OTP ───────────────────────────────────────────────────────────────
  function handleSend() {
    setError('')
    startT(async () => {
      const r = await sendPhoneOtpAction(phone)
      if (r.error) { setError(r.error); return }
      setE164(r.phone!)
      setStage('enter-otp')
      setCountdown(60)
    })
  }

  // ── OTP digit input ───────────────────────────────────────────────────────
  function handleDigit(i: number, val: string) {
    // Handle paste of full code
    if (val.length === 6 && /^\d{6}$/.test(val)) {
      const arr = val.split('')
      setDigits(arr)
      refs.current[5]?.focus()
      submitOtp(arr.join(''))
      return
    }
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = digit
    setDigits(next)
    if (digit && i < 5) refs.current[i + 1]?.focus()
    if (digit && i === 5 && next.join('').length === 6) submitOtp(next.join(''))
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
  }

  // ── Verify OTP ────────────────────────────────────────────────────────────
  function submitOtp(token: string) {
    setError('')
    startT(async () => {
      const r = await verifyPhoneOtpAction(e164Phone, token)
      if (r.error) {
        setError(r.error)
        setDigits(['', '', '', '', '', ''])
        refs.current[0]?.focus()
        return
      }
      setStage('success')
    })
  }

  // ── Resend ────────────────────────────────────────────────────────────────
  async function handleResend() {
    setResendPending(true)
    setError('')
    const r = await resendPhoneOtpAction(e164Phone)
    setResendPending(false)
    if (r.error) { setError(r.error); return }
    setResendMsg('New code sent!')
    setCountdown(60)
    setTimeout(() => setResendMsg(''), 4000)
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '28px 20px', fontFamily: "'DM Sans', sans-serif" }}>

      {/* Back */}
      <Link href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#6A6A60', textDecoration: 'none', marginBottom: 28 }}>
        <ArrowLeft size={16} /> Back to settings
      </Link>

      {/* ── Success ───────────────────────────────────────────────────────── */}
      {stage === 'success' && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(26,158,95,0.1)', border: '2px solid rgba(26,158,95,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <CheckCircle size={36} color="#1A9E5F" />
          </div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em', marginBottom: 10 }}>
            Phone verified!
          </h1>
          <p style={{ fontSize: 15, color: '#6A6A60', lineHeight: 1.6, marginBottom: 32 }}>
            {toDisplay(e164Phone)} is now linked to your account.<br />
            You can now withdraw earnings and use 2FA.
          </p>
          <button
            onClick={() => router.push('/settings')}
            style={{ background: '#1A9E5F', color: 'white', border: 'none', borderRadius: 10, padding: '13px 32px', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
          >
            Back to settings
          </button>
        </div>
      )}

      {/* ── Enter phone ───────────────────────────────────────────────────── */}
      {stage === 'enter-phone' && (
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 28 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(26,158,95,0.1)', border: '1px solid rgba(26,158,95,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Shield size={22} color="#1A9E5F" />
            </div>
            <div>
              <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: '#F0F0EC', letterSpacing: '-0.02em', marginBottom: 4 }}>
                Verify phone number
              </h1>
              <p style={{ fontSize: 14, color: '#6A6A60', lineHeight: 1.5 }}>
                Required for withdrawals and 2FA. We&apos;ll send a one-time code via SMS.
              </p>
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(229,57,53,0.08)', border: '1px solid rgba(229,57,53,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: '#E57373' }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: '#8A8A85', display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Nigerian phone number
            </label>
            <div style={{ position: 'relative' }}>
              <Phone size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#44444A', pointerEvents: 'none' }} />
              <input
                type="tel"
                inputMode="numeric"
                placeholder="08012345678"
                value={phone}
                onChange={e => { setPhone(e.target.value); setError('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
                autoFocus
                style={{ ...INP, paddingLeft: 38 }}
              />
            </div>
            <p style={{ fontSize: 12, color: '#44444A', marginTop: 6 }}>
              MTN, Airtel, Glo, 9Mobile — Nigerian numbers only
            </p>
          </div>

          <button
            onClick={handleSend}
            disabled={isPending || phone.trim().length < 10}
            style={{
              width: '100%', background: '#1A9E5F', color: 'white', border: 'none',
              borderRadius: 10, padding: '13px', fontFamily: "'Syne', sans-serif",
              fontWeight: 700, fontSize: 15, cursor: 'pointer', letterSpacing: '0.01em',
              opacity: (isPending || phone.trim().length < 10) ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {isPending ? 'Sending code…' : 'Send verification code'}
          </button>
        </div>
      )}

      {/* ── Enter OTP ─────────────────────────────────────────────────────── */}
      {stage === 'enter-otp' && (
        <div>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: '#F0F0EC', letterSpacing: '-0.02em', marginBottom: 6 }}>
              Enter the code
            </h1>
            <p style={{ fontSize: 14, color: '#6A6A60' }}>
              We sent a 6-digit SMS to
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#131318', border: '1px solid #1E1E26', borderRadius: 8, padding: '6px 14px', marginTop: 8 }}>
              <Phone size={13} color="#1A9E5F" />
              <span style={{ fontSize: 14, color: '#F0F0EC', fontWeight: 600, fontFamily: "'Syne', sans-serif" }}>
                {toDisplay(e164Phone)}
              </span>
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(229,57,53,0.08)', border: '1px solid rgba(229,57,53,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: '#E57373' }}>
              {error}
            </div>
          )}
          {resendMsg && (
            <div style={{ background: 'rgba(26,158,95,0.08)', border: '1px solid rgba(26,158,95,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: '#1A9E5F' }}>
              {resendMsg}
            </div>
          )}

          {/* 6-box OTP input */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 28 }}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={el => { refs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={d}
                onChange={e => handleDigit(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                onFocus={e => e.target.select()}
                style={{
                  width: 52, height: 60, textAlign: 'center',
                  fontSize: 24, fontFamily: "'Syne', sans-serif", fontWeight: 700,
                  background: d ? 'rgba(26,158,95,0.08)' : '#131318',
                  border: `2px solid ${d ? '#1A9E5F' : '#1E1E26'}`,
                  borderRadius: 12, color: '#F0F0EC', outline: 'none',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              />
            ))}
          </div>

          <button
            onClick={() => submitOtp(digits.join(''))}
            disabled={digits.join('').length !== 6 || isPending}
            style={{
              width: '100%', background: '#1A9E5F', color: 'white', border: 'none',
              borderRadius: 10, padding: '13px', fontFamily: "'Syne', sans-serif",
              fontWeight: 700, fontSize: 15, cursor: 'pointer',
              opacity: (digits.join('').length !== 6 || isPending) ? 0.5 : 1,
              marginBottom: 20, transition: 'opacity 0.15s',
            }}
          >
            {isPending ? 'Verifying…' : 'Verify phone number'}
          </button>

          {/* Resend / change number */}
          <div style={{ textAlign: 'center' }}>
            {countdown > 0 ? (
              <p style={{ fontSize: 14, color: '#44444A' }}>
                Resend in <span style={{ color: '#8A8A85', fontWeight: 600 }}>{countdown}s</span>
              </p>
            ) : (
              <button
                onClick={handleResend}
                disabled={resendPending}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#1A9E5F', fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
              >
                {resendPending ? 'Sending…' : 'Resend code'}
              </button>
            )}
            <br />
            <button
              onClick={() => { setStage('enter-phone'); setDigits(['','','','','','']); setError('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#44444A', marginTop: 8, fontFamily: "'DM Sans', sans-serif" }}
            >
              Wrong number? Change it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}