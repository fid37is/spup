'use client'

// src/components/chat/pin-gate.tsx
// Shows a PIN entry screen before granting access to the chat.
// On first use — prompts to create a 4-digit PIN.
// On subsequent logins — prompts to enter existing PIN.
// PIN is stored as bcrypt hash in the DB, never in plaintext.
// Session-level unlock is stored in sessionStorage so user
// doesn't need to re-enter the PIN on every page navigation within the same session.

import { useState, useEffect, useRef } from 'react'
import { setChatPinAction, verifyChatPinAction, hasChatPinAction } from '@/lib/actions/messages'
import { Lock, Eye, EyeOff, Shield } from 'lucide-react'

const SESSION_KEY = 'spup_chat_unlocked_uid'

interface PinGateProps {
  children: React.ReactNode
}

export default function PinGate({ children }: PinGateProps) {
  const [status, setStatus] = useState<'loading' | 'unlocked' | 'create' | 'verify'>('loading')
  const [pin, setPin] = useState(['', '', '', ''])
  const [confirmPin, setConfirmPin] = useState(['', '', '', ''])
  const [step, setStep] = useState<'enter' | 'confirm'>('enter')
  const [error, setError] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const inputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]
  const confirmRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]

  useEffect(() => {
    async function init() {
      // Get current auth user ID from Supabase client session
      const { createBrowserClient } = await import('@/lib/supabase/client')
      const supabase = createBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return // middleware handles redirect

      // Check if this exact user already unlocked chat in this session
      const storedUid = sessionStorage.getItem(SESSION_KEY)
      if (storedUid === user.id) {
        setStatus('unlocked')
        return
      }

      // Different user or fresh session — clear any stale unlock and require PIN
      sessionStorage.removeItem(SESSION_KEY)
      const { hasPin } = await hasChatPinAction()
      setStatus(hasPin ? 'verify' : 'create')
    }
    init()
  }, [])

  function handlePinInput(index: number, value: string, isConfirm = false) {
    const refs = isConfirm ? confirmRefs : inputRefs
    const current = isConfirm ? [...confirmPin] : [...pin]
    const setter = isConfirm ? setConfirmPin : setPin

    if (!/^\d*$/.test(value)) return
    current[index] = value.slice(-1)
    setter(current)
    setError('')

    if (value && index < 3) {
      refs[index + 1].current?.focus()
    }

    // Auto-submit when all 4 digits filled
    if (value && index === 3) {
      const full = [...current.slice(0, 3), value.slice(-1)].join('')
      if (full.length === 4) {
        setTimeout(() => {
          if (isConfirm) handleConfirmPin(full)
          else if (status === 'verify') handleVerify(full)
          else { setStep('confirm'); confirmRefs[0].current?.focus() }
        }, 100)
      }
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent, isConfirm = false) {
    const refs = isConfirm ? confirmRefs : inputRefs
    const current = isConfirm ? confirmPin : pin
    const setter = isConfirm ? setConfirmPin : setPin

    if (e.key === 'Backspace' && !current[index] && index > 0) {
      const next = [...current]
      next[index - 1] = ''
      setter(next)
      refs[index - 1].current?.focus()
    }
  }

  async function handleVerify(fullPin?: string) {
    const pinStr = fullPin ?? pin.join('')
    if (pinStr.length !== 4) return
    setIsPending(true)
    const { valid } = await verifyChatPinAction(pinStr)
    setIsPending(false)
    if (valid) {
      const { createBrowserClient } = await import('@/lib/supabase/client')
      const supabase = createBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) sessionStorage.setItem(SESSION_KEY, user.id)
      setStatus('unlocked')
    } else {
      setError('Incorrect PIN. Try again.')
      setPin(['', '', '', ''])
      inputRefs[0].current?.focus()
    }
  }

  async function handleConfirmPin(fullPin?: string) {
    const confirmStr = fullPin ?? confirmPin.join('')
    const enterStr = pin.join('')
    if (confirmStr.length !== 4) return
    if (confirmStr !== enterStr) {
      setError('PINs do not match. Try again.')
      setConfirmPin(['', '', '', ''])
      confirmRefs[0].current?.focus()
      return
    }
    setIsPending(true)
    const result = await setChatPinAction(enterStr)
    setIsPending(false)
    if ('error' in result && result.error) { setError(result.error); return }
    const { createBrowserClient } = await import('@/lib/supabase/client')
    const supabase = createBrowserClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) sessionStorage.setItem(SESSION_KEY, user.id)
    setStatus('unlocked')
  }

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--color-brand)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (status === 'unlocked') return <>{children}</>

  const isCreate = status === 'create'
  const activePin = step === 'confirm' ? confirmPin : pin
  const activeRefs = step === 'confirm' ? confirmRefs : inputRefs
  const isConfirmStep = step === 'confirm'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '70vh', padding: '40px 20px',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'var(--color-brand)', opacity: 0.9,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
      }}>
        {isCreate ? <Shield size={28} color="white" /> : <Lock size={28} color="white" />}
      </div>

      <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: 'var(--color-text-primary)', marginBottom: 8, textAlign: 'center' }}>
        {isCreate
          ? (isConfirmStep ? 'Confirm your PIN' : 'Create a chat PIN')
          : 'Enter your chat PIN'
        }
      </h2>
      <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 36, textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>
        {isCreate
          ? (isConfirmStep
            ? 'Re-enter your 4-digit PIN to confirm'
            : 'Set a 4-digit PIN to keep your messages private'
          )
          : 'Enter your PIN to access your messages'
        }
      </p>

      {/* PIN dots */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 28, position: 'relative' }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ position: 'relative' }}>
            <input
              ref={activeRefs[i]}
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={1}
              value={activePin[i]}
              onChange={e => handlePinInput(i, e.target.value, isConfirmStep)}
              onKeyDown={e => handleKeyDown(i, e, isConfirmStep)}
              autoFocus={i === 0}
              style={{
                width: 56, height: 64,
                textAlign: 'center',
                fontSize: 24, fontWeight: 700,
                background: 'var(--color-surface-2)',
                border: `2px solid ${activePin[i] ? 'var(--color-brand)' : 'var(--color-border)'}`,
                borderRadius: 14,
                color: 'var(--color-text-primary)',
                outline: 'none',
                caretColor: 'var(--color-brand)',
                transition: 'border-color 0.15s',
                fontFamily: "'Syne', sans-serif",
              }}
            />
          </div>
        ))}

        {/* Show/hide toggle */}
        <button
          onClick={() => setShowPin(v => !v)}
          style={{
            position: 'absolute', right: -40, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-secondary)', padding: 4,
          }}
        >
          {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--color-error)', marginBottom: 16, textAlign: 'center' }}>
          {error}
        </p>
      )}

      <button
        onClick={() => isCreate
          ? (isConfirmStep ? handleConfirmPin() : (pin.join('').length === 4 && (setStep('confirm'), confirmRefs[0].current?.focus())))
          : handleVerify()
        }
        disabled={activePin.join('').length !== 4 || isPending}
        style={{
          background: activePin.join('').length === 4 ? 'var(--color-brand)' : 'var(--color-surface-2)',
          color: activePin.join('').length === 4 ? 'white' : 'var(--color-text-muted)',
          border: 'none', borderRadius: 14, padding: '13px 40px',
          fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
          cursor: activePin.join('').length === 4 ? 'pointer' : 'not-allowed',
          transition: 'all 0.15s', width: '100%', maxWidth: 280,
          marginBottom: 16,
        }}
      >
        {isPending ? 'Verifying…' : isCreate ? (isConfirmStep ? 'Confirm PIN' : 'Continue') : 'Unlock Chat'}
      </button>

      {isCreate && isConfirmStep && (
        <button onClick={() => { setStep('enter'); setConfirmPin(['', '', '', '']); setError('') }}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13 }}>
          ← Go back
        </button>
      )}
    </div>
  )
}