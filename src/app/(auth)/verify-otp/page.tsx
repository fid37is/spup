'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { verifyOtpAction, resendOtpAction } from '@/lib/actions'
import { AuthCard, Alert } from '@/components/auth/form-field'
import { Phone } from 'lucide-react'

function OtpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const phone = searchParams.get('phone') || ''

  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [countdown, setCountdown] = useState(30)
  const refs = useRef<(HTMLInputElement | null)[]>([])

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  function handleDigitChange(i: number, val: string) {
    // Handle paste of full OTP
    if (val.length === 6 && /^\d{6}$/.test(val)) {
      const arr = val.split('')
      setDigits(arr)
      refs.current[5]?.focus()
      submitOtp(arr.join(''))
      return
    }

    const digit = val.replace(/\D/, '').slice(-1)
    const next = [...digits]
    next[i] = digit
    setDigits(next)

    if (digit && i < 5) refs.current[i + 1]?.focus()

    // Auto-submit when last digit entered
    if (digit && i === 5) {
      const otp = next.join('')
      if (otp.length === 6) submitOtp(otp)
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus()
    }
  }

  async function submitOtp(token: string) {
    setError('')
    setLoading(true)
    const result = await verifyOtpAction(phone, { token })
    setLoading(false)
    if (result.error) {
      setError(result.error)
      setDigits(['', '', '', '', '', ''])
      refs.current[0]?.focus()
    } else {
      router.push('/onboarding')
      router.refresh()
    }
  }

  async function handleResend() {
    setResendLoading(true)
    setError('')
    const result = await resendOtpAction(phone)
    setResendLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setResendSuccess(true)
      setCountdown(60)
      setTimeout(() => setResendSuccess(false), 4000)
    }
  }

  // Display phone
  const displayPhone = phone.replace('+234', '0').replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3')

  return (
    <AuthCard title="Verify your number" subtitle="Enter the 6-digit code we sent you">

      {/* Phone badge */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        background: '#181818', border: '1px solid #2A2A2A', borderRadius: 10,
        padding: '10px 16px', marginBottom: 32,
      }}>
        <Phone size={14} color="#22A861" />
        <span style={{ fontSize: 14, color: '#9A9A90' }}>{displayPhone}</span>
      </div>

      {error && <Alert type="error" message={error} />}
      {resendSuccess && <Alert type="success" message="New code sent! Check your messages." />}

      {/* OTP inputs */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 32 }}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={el => { refs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={d}
            onChange={e => handleDigitChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            onFocus={e => e.target.select()}
            style={{
              width: 52, height: 60, textAlign: 'center',
              fontSize: 24, fontFamily: "'Syne', sans-serif", fontWeight: 700,
              background: d ? '#1A2E1F' : '#181818',
              border: `2px solid ${d ? '#1A7A4A' : '#2A2A2A'}`,
              borderRadius: 12, color: '#F5F5F0', outline: 'none',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          />
        ))}
      </div>

      {/* Submit button */}
      <button
        onClick={() => submitOtp(digits.join(''))}
        disabled={digits.join('').length !== 6 || loading}
        className="para-btn-primary"
        style={{ marginBottom: 24 }}
      >
        {loading ? 'Verifying...' : 'Verify code'}
      </button>

      {/* Resend */}
      <div style={{ textAlign: 'center' }}>
        {countdown > 0 ? (
          <p style={{ fontSize: 14, color: '#555' }}>
            Resend code in <span style={{ color: '#9A9A90', fontWeight: 500 }}>{countdown}s</span>
          </p>
        ) : (
          <button
            onClick={handleResend}
            disabled={resendLoading}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#22A861', fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
          >
            {resendLoading ? 'Sending...' : 'Resend code'}
          </button>
        )}
      </div>

      <p style={{ textAlign: 'center', fontSize: 12, color: '#3A3A35', marginTop: 24 }}>
        Wrong number?{' '}
        <a href="/signup" style={{ color: '#555', textDecoration: 'underline' }}>Go back</a>
      </p>
    </AuthCard>
  )
}

export default function VerifyOtpPage() {
  return <Suspense><OtpForm /></Suspense>
}
