'use client'

// src/components/settings/change-chat-pin.tsx
//
// "Change chat PIN" row + bottom sheet for the Security section of Settings.
// Self-contained on purpose: drop <ChangeChatPinRow /> into that section.
//
// The E2E key that protects message history is wrapped with a key derived from
// `${PIN}:${pepper}`. So changing the PIN is not just a new hash on the
// server - the key is re-wrapped in the browser under the new PIN first
// (rewrapKeyForNewPassword), then the server verifies the current PIN and
// saves both together (changeChatPinAction).

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { KeyRound, ChevronRight, Loader, Check } from 'lucide-react'
import { verifyChatPinAction, getWrappedKeyAction, uploadWrappedKeyAction } from '@/lib/actions/messages'
import { changeChatPinAction } from '@/lib/actions/chat-pin'
import { rewrapKeyForNewPassword, WrongPasswordError } from '@/lib/chat-crypto'
import { setSessionPinMaterial } from '@/lib/chat-pin-session'

const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--input-bg)', border: '1px solid var(--color-border)', borderRadius: 10,
  padding: '12px 14px', color: 'var(--color-text-primary)',
  fontSize: 18, letterSpacing: '0.5em', textAlign: 'center', outline: 'none',
  fontFamily: "'DM Sans', sans-serif",
}

function PinField({ label, value, onChange, autoFocus = false }: {
  label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
        {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        placeholder="••••"
        autoFocus={autoFocus}
        style={INPUT}
      />
    </div>
  )
}

export default function ChangeChatPinRow({ last = false }: { last?: boolean }) {
  const [open, setOpen] = useState(false)
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  function close() {
    if (busy) return
    setOpen(false); setOldPin(''); setNewPin(''); setConfirmPin(''); setError(''); setDone(false)
  }

  async function submit() {
    setError('')
    if (oldPin.length !== 4 || newPin.length !== 4 || confirmPin.length !== 4) { setError('Enter all three 4-digit PINs.'); return }
    if (newPin !== confirmPin) { setError("The new PINs don't match."); return }
    if (newPin === oldPin) { setError('Your new PIN must be different from your current one.'); return }

    setBusy(true)
    try {
      // 1. Check the current PIN and get the pepper the key is wrapped with.
      const check = await verifyChatPinAction(oldPin)
      if (!check.valid) {
        setError('noPin' in check && check.noPin ? "You haven't set a chat PIN yet." : 'Current PIN is incorrect.')
        return
      }
      const pepper = check.pepper ?? null

      // 2. Re-wrap the E2E key under the new PIN (needs the pepper).
      let rewrapped: { wrapped: string; salt: string; iv: string } | null = null
      if (pepper) {
        try {
          rewrapped = await rewrapKeyForNewPassword({
            oldPassword: `${oldPin}:${pepper}`,
            newPassword: `${newPin}:${pepper}`,
            fetchWrapped: async () => (await getWrappedKeyAction()).wrapped ?? null,
          })
        } catch (err) {
          if (err instanceof WrongPasswordError) {
            setError("We couldn't unlock your saved chat key on this device. Open Messages on the device you normally chat from and change your PIN there.")
            return
          }
          throw err
        }
      }

      // 3. Save: server re-checks the current PIN, then updates PIN + key together.
      const r = await changeChatPinAction(oldPin, newPin, rewrapped)
      if ('error' in r && r.error) { setError(r.error); return }
      if (!('success' in r)) { setError('Something went wrong. Please try again.'); return }

      // The PIN gate / chat screens in this tab should use the new PIN from now on.
      setSessionPinMaterial(newPin, r.pepper)

      // Users who never had a pepper had nothing wrapped under it yet; now that
      // they have one, wrap the key this device holds (best effort).
      if (r.pepperIsNew) {
        try {
          const w = await rewrapKeyForNewPassword({
            oldPassword: '', newPassword: `${newPin}:${r.pepper}`, fetchWrapped: async () => null,
          })
          if (w) await uploadWrappedKeyAction(w.wrapped, w.salt, w.iv)
        } catch { /* nothing to lose - the PIN itself is already changed */ }
      }

      setDone(true)
      setTimeout(close, 1400)
    } catch {
      setError('Something went wrong. Please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const canSubmit = oldPin.length === 4 && newPin.length === 4 && confirmPin.length === 4 && !busy && !done

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        role="button"
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
          borderBottom: last ? 'none' : '1px solid var(--color-border)',
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          background: 'var(--color-surface-raised)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <KeyRound size={15} color="var(--color-text-secondary)" strokeWidth={1.8} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>Change chat PIN</div>
          <div style={{ fontSize: 13, marginTop: 2, lineHeight: 1.3, color: 'var(--color-text-muted)' }}>
            Update the 4-digit PIN that protects your messages
          </div>
        </div>
        <ChevronRight size={15} color="var(--color-text-faint)" />
      </div>

      {open && typeof document !== 'undefined' && createPortal(
        <>
          <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'var(--overlay-bg)' }} />
          <div style={{ position: 'fixed', inset: 0, zIndex: 401, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', pointerEvents: 'none' }}>
            <div
              onClick={e => e.stopPropagation()}
              style={{
                pointerEvents: 'auto',
                background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)',
                borderTopLeftRadius: 20, borderTopRightRadius: 20,
                padding: '24px 24px calc(24px + env(safe-area-inset-bottom))',
                width: '100%', maxWidth: 480,
              }}
            >
              <h3 style={{ margin: '0 0 6px', textAlign: 'center', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)' }}>
                Change chat PIN
              </h3>
              <p style={{ margin: '0 0 20px', textAlign: 'center', fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                Your message history stays readable - it is re-protected with the new PIN.
              </p>

              <PinField label="Current PIN" value={oldPin} onChange={setOldPin} autoFocus />
              <PinField label="New PIN" value={newPin} onChange={setNewPin} />
              <PinField label="Confirm new PIN" value={confirmPin} onChange={setConfirmPin} />

              {error && <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--color-error)', lineHeight: 1.5 }}>{error}</p>}

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={close}
                  disabled={busy}
                  className="para-btn-ghost"
                  style={{ flex: 1, padding: '13px 0', fontSize: 15, fontFamily: "'Syne', sans-serif", fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={!canSubmit}
                  className="para-btn-primary"
                  style={{
                    flex: 1, padding: 13, fontSize: 15, fontFamily: "'Syne', sans-serif", fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  }}
                >
                  {done
                    ? <><Check size={15} /> PIN changed</>
                    : busy
                      ? <><Loader size={14} style={{ animation: 'spin .7s linear infinite' }} /> Changing…</>
                      : 'Change PIN'}
                </button>
              </div>
            </div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </>,
        document.body
      )}
    </>
  )
}
