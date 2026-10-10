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
import {
  setChatPinAction, verifyChatPinAction, hasChatPinAction,
  getPublicKeyAction, uploadWrappedKeyAction,
} from '@/lib/actions/messages'
import { requestChatPinResetAction, confirmChatPinResetAction, clearChatKeyBackupAction } from '@/lib/actions/chat-pin-reset'
import { rewrapKeyForNewPassword } from '@/lib/chat-crypto'
import { setSessionPinMaterial, clearSessionPinMaterial } from '@/lib/chat-pin-session'
import { clearChatListCache } from '@/lib/chat-list-cache'
import { Lock, Shield } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/language-context'

const UNLOCK_KEY = 'spup_chat_unlocked'

type UnlockRecord = { uid: string; sid: string }

// Remembers, for the life of this page session, that the gate was already passed
// for the current sign-in. Without it every visit to Chat (or into a thread)
// remounted the gate in its 'loading' state and flashed a spinner while it
// re-read the auth session - on every single navigation. The gate still
// re-verifies in the background on mount; this only removes the flash. It is
// reset when the signed-in layout unmounts (sign-out), see ChatCacheGuard.
let unlockedMemo: UnlockRecord | null = null

export function resetPinGateMemo() {
  unlockedMemo = null
}

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
  unlockedMemo = { uid, sid }
  try { localStorage.setItem(UNLOCK_KEY, JSON.stringify({ uid, sid })) } catch { /* private mode */ }
}

interface PinGateProps {
  children: React.ReactNode
}

export default function PinGate({ children }: PinGateProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'loading' | 'unlocked' | 'create' | 'verify'>(() => (unlockedMemo ? 'unlocked' : 'loading'))
  const [pin, setPin] = useState(['', '', '', ''])
  const [confirmPin, setConfirmPin] = useState(['', '', '', ''])
  const [step, setStep] = useState<'enter' | 'confirm'>('enter')
  const [error, setError] = useState('')
  // "Forgot PIN" flow (verify screen only): emailed code + new PIN.
  const [resetting, setResetting] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetPin, setResetPin] = useState('')
  const [resetPin2, setResetPin2] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetNote, setResetNote] = useState('')
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
        unlockedMemo = { uid: stored.uid, sid: stored.sid }
        setStatus('unlocked')
        return
      }

      // A different user, a fresh sign-in (new session_id), or no record yet
      // - clear any stale unlock and require the PIN.
      try { localStorage.removeItem(UNLOCK_KEY) } catch { /* private mode */ }
      unlockedMemo = null
      clearSessionPinMaterial() // don't let a previous account's key material leak into this one
      clearChatListCache()      // ...nor its cached chat list or decrypted previews
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
        ? t('chat.pin_too_many_attempts')
        : t('chat.pin_incorrect'))
      setPin(['', '', '', ''])
      inputRefs[0].current?.focus()
    }
  }

  async function handleConfirmPin(fullPin?: string) {
    const confirmStr = fullPin ?? confirmPin.join('')
    const enterStr = pin.join('')
    if (confirmStr.length !== 4) return
    if (confirmStr !== enterStr) {
      setError(t('chat.pins_dont_match'))
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

  async function sendResetCode(isResend = false) {
    setResetBusy(true); setResetError(''); setResetNote('')
    const r = await requestChatPinResetAction().catch(() => ({ error: 'Something went wrong. Please check your connection and try again.' }))
    setResetBusy(false)
    if ('error' in r && r.error) { setResetError(r.error); return }
    if ('email' in r && typeof r.email === 'string') setResetEmail(r.email)
    if (isResend) setResetNote('A new code is on its way.')
  }

  function startReset() {
    setResetting(true)
    setResetCode(''); setResetPin(''); setResetPin2(''); setResetError(''); setResetNote('')
    void sendResetCode()
  }

  function cancelReset() {
    setResetting(false)
    setResetError(''); setResetNote('')
  }

  async function submitReset() {
    setResetError('')
    if (!/^\d{6}$/.test(resetCode)) { setResetError('Enter the 6-digit code from your email.'); return }
    if (resetPin.length !== 4) { setResetError('Your new PIN must be 4 digits.'); return }
    if (resetPin !== resetPin2) { setResetError("The new PINs don't match."); return }

    setResetBusy(true)
    try {
      // 1. Server checks the emailed code and saves the new PIN.
      const r = await confirmChatPinResetAction(resetCode, resetPin)
      if (!('success' in r) || !r.userId || !r.pepper) { setResetError(('error' in r && r.error) || 'Something went wrong. Please try again.'); return }
      const { userId, pepper } = r

      // 2. Put the chat key back under the new PIN (needs the pepper). This
      //    device's copy is used; if it has none, the old backup is unreadable
      //    and is cleared so a fresh one is made.
      try {
        const rewrapped = await rewrapKeyForNewPassword({
          userId,
          fetchPublicKey: async () => (await getPublicKeyAction(userId)).publicKey,
          oldPassword: '',
          newPassword: `${resetPin}:${pepper}`,
          fetchWrapped: async () => null,
        })
        if (rewrapped) await uploadWrappedKeyAction(rewrapped.wrapped, rewrapped.salt, rewrapped.iv)
        else await clearChatKeyBackupAction()
      } catch (e) {
        console.error('[pin reset] could not update the key backup:', e)
      }

      // 3. Unlock with the new PIN (the code check also refreshed the session).
      const { createBrowserClient } = await import('@/lib/supabase/client')
      const { data: { session } } = await createBrowserClient().auth.getSession()
      if (session?.user) writeUnlockRecord(session.user.id, getSessionId(session.access_token))
      setSessionPinMaterial(resetPin, pepper)
      setResetting(false)
      setStatus('unlocked')
    } catch {
      setResetError('Something went wrong. Please check your connection and try again.')
    } finally {
      setResetBusy(false)
    }
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

  if (resetting && status === 'verify') {
    const field: React.CSSProperties = {
      width: '100%', boxSizing: 'border-box', background: 'var(--color-surface-2)',
      border: '2px solid var(--color-border)', borderRadius: 14, padding: '14px',
      color: 'var(--color-text-primary)', fontSize: 20, fontWeight: 700, textAlign: 'center',
      letterSpacing: '0.4em', outline: 'none', fontFamily: "'Syne', sans-serif",
    }
    const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', margin: '0 0 6px' }
    const ready = /^\d{6}$/.test(resetCode) && resetPin.length === 4 && resetPin2.length === 4 && !resetBusy
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: '40px 20px' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-brand)', opacity: 0.9, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <Shield size={28} color="white" />
        </div>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: 'var(--color-text-primary)', marginBottom: 8, textAlign: 'center' }}>
          Reset your chat PIN
        </h2>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 24, textAlign: 'center', maxWidth: 300, lineHeight: 1.5 }}>
          {resetEmail ? `Enter the 6-digit code we emailed to ${resetEmail}, then choose a new PIN.` : 'Sending a 6-digit code to your account email…'}
        </p>

        <div style={{ width: '100%', maxWidth: 280 }}>
          <label style={label}>Email code</label>
          <input value={resetCode} onChange={e => { setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setResetError('') }}
            inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" autoFocus style={{ ...field, marginBottom: 14 }} />
          <label style={label}>New PIN</label>
          <input value={resetPin} onChange={e => { setResetPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setResetError('') }}
            type="password" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="••••" style={{ ...field, marginBottom: 14 }} />
          <label style={label}>Confirm new PIN</label>
          <input value={resetPin2} onChange={e => { setResetPin2(e.target.value.replace(/\D/g, '').slice(0, 4)); setResetError('') }}
            type="password" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="••••" style={{ ...field, marginBottom: 14 }}
            onKeyDown={e => { if (e.key === 'Enter' && ready) void submitReset() }} />
        </div>

        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', maxWidth: 280, lineHeight: 1.5, textAlign: 'center', margin: '0 0 16px' }}>
          Messages stay readable on this device. If this device doesn&apos;t have your chat key saved, older messages may not be readable again.
        </p>

        {resetError && <p style={{ fontSize: 13, color: 'var(--color-error)', marginBottom: 12, textAlign: 'center' }}>{resetError}</p>}
        {resetNote && !resetError && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12, textAlign: 'center' }}>{resetNote}</p>}

        <button onClick={() => void submitReset()} disabled={!ready}
          style={{
            background: ready ? 'var(--color-brand)' : 'var(--color-surface-2)',
            color: ready ? 'white' : 'var(--color-text-muted)',
            border: 'none', borderRadius: 14, padding: '13px 40px',
            fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
            cursor: ready ? 'pointer' : 'not-allowed', width: '100%', maxWidth: 280, marginBottom: 16,
          }}>
          {resetBusy ? t('wallet.verifying') : 'Reset PIN'}
        </button>
        <button onClick={() => void sendResetCode(true)} disabled={resetBusy}
          style={{ background: 'none', border: 'none', color: 'var(--color-brand)', cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          Resend code
        </button>
        <button onClick={cancelReset}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13 }}>
          ← {t('profile.go_back')}
        </button>
      </div>
    )
  }

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
          ? (isConfirmStep ? t('chat.confirm_your_pin') : t('chat.create_chat_pin'))
          : t('chat.enter_your_chat_pin')
        }
      </h2>
      <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 36, textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>
        {isCreate
          ? (isConfirmStep
            ? t('chat.reenter_pin_confirm')
            : t('chat.set_4digit_pin')
          )
          : t('chat.enter_pin_access')
        }
      </p>

      {/* PIN dots */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 28, position: 'relative' }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ position: 'relative' }}>
            <input
              ref={activeRefs[i]}
              type="password"
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
        {isPending ? t('wallet.verifying') : isCreate ? (isConfirmStep ? t('chat.confirm_pin_btn') : t('wallet.continue')) : t('chat.unlock_chat')}
      </button>

      {!isCreate && (
        <button onClick={startReset}
          style={{ background: 'none', border: 'none', color: 'var(--color-brand)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Forgot PIN?
        </button>
      )}

      {isCreate && isConfirmStep && (
        <button onClick={() => { setStep('enter'); setConfirmPin(['', '', '', '']); setError('') }}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13 }}>
          ← {t('profile.go_back')}
        </button>
      )}
    </div>
  )
}