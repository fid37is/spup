'use client'

// src/components/chat/pin-gate.tsx
// Shows a PIN entry screen before granting access to the chat.
// On first use - prompts to create a 4-digit PIN.
// On subsequent logins - prompts to enter existing PIN.
// PIN is stored as bcrypt hash in the DB, never in plaintext.
//
// The unlock is scoped to the current AUTH SESSION, not the browser tab and
// not the account. It's stored in localStorage (survives closing the tab/app
// and relaunching - the auth cookie itself lives for 30 days, see
// lib/supabase/cookie-options.ts, so the PIN gate has to survive at least
// that long too) keyed by the Supabase session's `session_id` JWT claim.
// That claim is stable across access-token refreshes within one login, but
// changes on every fresh sign-in - so:
//   - relaunching the app / reopening the tab while still logged in: same
//     session_id -> stays unlocked, no re-prompt.
//   - sign out, sign back in (even as the same user): a brand new session is
//     minted server-side -> new session_id -> PIN asked once more.
//   - a different device/browser has no entry for this session_id at all ->
//     PIN asked once, then that device remembers it the same way.
// We deliberately do NOT key this off the access token itself, since that
// value rotates on every refresh even within the same session and would
// force a re-prompt far more often than intended.
//
// (Previously this used sessionStorage keyed only by user id, which had the
// opposite problem on both counts: it survived a sign-out/sign-in cycle as
// the same user (skipping the PIN entirely on re-auth), while also getting
// wiped every time the tab/app closed even though the underlying session was
// still valid (re-prompting on every relaunch).)

import { useState, useEffect, useRef } from 'react'
import { setChatPinAction, verifyChatPinAction, hasChatPinAction } from '@/lib/actions/messages'
import { setSessionPinMaterial, clearSessionPinMaterial } from '@/lib/chat-pin-session'
import { Lock, Eye, EyeOff, Shield } from 'lucide-react'

const UNLOCK_KEY = 'spup_chat_unlocked'

type UnlockRecord = { uid: string; sid: string }

// Reads the `session_id` claim out of a Supabase access token (a JWT) without
// verifying it - this is purely a client-side UX gate, not the security
// boundary. The real checks (PIN hash comparison, rate limiting) happen
// server-side in verifyChatPinAction/setChatPinAction regardless of what's
// in localStorage.
function getSessionId(accessToken: string | undefined | null): string | null {
  if (!accessToken) return null
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return null
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const claims = JSON.parse(json)
    return typeof claims.session_id === 'string' ? claims.session_id : null
  } catch {
    return null
  }
}

function readUnlockRecord(): UnlockRecord | null {
  try {
    const raw = localStorage.getItem(UNLOCK_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return typeof parsed?.uid === 'string' && typeof parsed?.sid === 'string' ? parsed : null
  } catch {
    return null
  }
}

function writeUnlockRecord(uid: string, sid: string | null) {
  if (!sid) return // no session_id claim available - fail safe, don't persist a bogus unlock
  try { localStorage.setItem(UNLOCK_KEY, JSON.stringify({ uid, sid })) } catch { /* private mode */ }
}

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
      // Get the current auth session (not just the user) so we can read the
      // session_id claim off its access token - see comment above.
      const { createBrowserClient } = await import('@/lib/supabase/client')
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return // middleware handles redirect

      const currentSid = getSessionId(session.access_token)
      const stored = readUnlockRecord()
      if (currentSid && stored && stored.uid === session.user.id && stored.sid === currentSid) {
        setStatus('unlocked')
        return
      }

      // A different user, a fresh sign-in (new session_id), or no record yet
      // - clear any stale unlock and require the PIN.
      try { localStorage.removeItem(UNLOCK_KEY) } catch { /* private mode */ }
      clearSessionPinMaterial() // don't let a previous account's key material leak into this one
      const { hasPin } = await hasChatPinAction()
      setStatus(hasPin ? 'verify' : 'create')
    }
    init()
  }, [])

  // The confirm-step inputs are the same DOM elements as the enter-step
  // ones, just re-pointed to confirmRefs on re-render - so focusing
  // confirmRefs[0] has to wait until after that re-render actually commits.
  // Calling it synchronously right after setStep('confirm') (as this used
  // to) hits confirmRefs[0].current while it's still null.
  useEffect(() => {
    if (step === 'confirm') confirmRefs[0].current?.focus()
  }, [step])

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
          else setStep('confirm')
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
    const result = await verifyChatPinAction(pinStr)
    setIsPending(false)
    if (result.valid) {
      const { createBrowserClient } = await import('@/lib/supabase/client')
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) writeUnlockRecord(session.user.id, getSessionId(session.access_token))
      // Stash PIN+pepper in memory so chat-client's E2E key recovery
      // (see recoverOrCreateKeyPair/getKeyMaterial) doesn't need to prompt
      // for it again right after this - see lib/chat-pin-session.ts.
      if (result.pepper) setSessionPinMaterial(pinStr, result.pepper)
      setStatus('unlocked')
    } else {
      setError('rateLimited' in result && result.rateLimited
        ? 'Too many attempts. Please wait a few minutes and try again.'
        : 'Incorrect PIN. Try again.')
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
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) writeUnlockRecord(session.user.id, getSessionId(session.access_token))
    if ('pepper' in result && result.pepper) setSessionPinMaterial(enterStr, result.pepper)
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
          ? (isConfirmStep ? handleConfirmPin() : (pin.join('').length === 4 && setStep('confirm')))
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