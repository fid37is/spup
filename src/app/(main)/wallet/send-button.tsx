'use client'

import { useState, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Send, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { formatNaira } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { transferAction } from '@/lib/actions/wallet-transfer'

type Step = 'form' | 'confirm' | 'success' | 'error'

interface Recipient {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
}

interface SendButtonProps {
  balance: number
}

export default function SendButton({ balance }: SendButtonProps) {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('form')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const router = useRouter()

  // Form state
  const [username, setUsername] = useState('')
  const [recipient, setRecipient] = useState<Recipient | null>(null)
  const [resolving, setResolving] = useState(false)
  const [amountKobo, setAmountKobo] = useState(0)
  const [note, setNote] = useState('')

  useEffect(() => { setMounted(true) }, [])

  // Auto-resolve recipient as the username is typed, same debounced
  // pattern as withdraw-button.tsx's account-name resolution.
  useEffect(() => {
    const clean = username.trim().replace(/^@/, '')
    if (clean.length < 2) { setRecipient(null); return }
    setRecipient(null)
    setResolving(true)
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/wallet/resolve-recipient?username=${encodeURIComponent(clean)}`)
        const data = await res.json()
        setRecipient(data.recipient ?? null)
      } catch {
        setRecipient(null)
      } finally {
        setResolving(false)
      }
    }, 500)
    return () => clearTimeout(timeout)
  }, [username])

  function reset() {
    setStep('form')
    setError('')
    setUsername('')
    setRecipient(null)
    setAmountKobo(0)
    setNote('')
  }

  function handleClose() {
    setOpen(false)
    setTimeout(reset, 300)
  }

  const canProceed = !!recipient && amountKobo >= 5_000 && amountKobo <= balance

  function handleConfirm() {
    if (!canProceed) return
    setStep('confirm')
  }

  function handleSend() {
    if (!recipient) return
    setError('')
    startTransition(async () => {
      const result = await transferAction({
        recipientUsername: recipient.username,
        amountKobo,
        note: note.trim() || undefined,
      })
      if (result.error) {
        setError(result.error)
        setStep('error')
        return
      }
      setStep('success')
      router.refresh()
    })
  }

  const modal = (
    <>
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
        background: 'var(--color-bg)',
        borderTop: '1px solid var(--color-border)',
        borderRadius: '20px 20px 0 0',
        maxHeight: '92dvh',
        overflowY: 'auto',
        animation: 'slideUp 0.25s cubic-bezier(0.4,0,0.2,1)',
        maxWidth: 560,
        margin: '0 auto',
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 16px' }}>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)' }}>
            {step === 'confirm' ? 'Confirm transfer' : step === 'success' ? 'Money sent' : step === 'error' ? 'Transfer failed' : 'Send money'}
          </h2>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '0 20px 40px' }}>

          {/* SUCCESS */}
          {step === 'success' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <CheckCircle size={32} color="var(--color-brand)" />
              </div>
              <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, color: 'var(--color-text-primary)', marginBottom: 8 }}>
                {formatNaira(amountKobo)} sent
              </p>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                @{recipient?.username} received it instantly in their wallet.
              </p>
              <button onClick={handleClose} style={{ marginTop: 28, width: '100%', padding: '14px', background: 'var(--color-brand)', color: 'white', border: 'none', borderRadius: 12, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                Done
              </button>
            </div>
          )}

          {/* ERROR */}
          {step === 'error' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <AlertCircle size={32} color="var(--color-error)" />
              </div>
              <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 8 }}>Something went wrong</p>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 28 }}>{error}</p>
              <button onClick={() => setStep('form')} style={{ width: '100%', padding: '14px', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: 12, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                Try again
              </button>
            </div>
          )}

          {/* CONFIRM */}
          {step === 'confirm' && recipient && (
            <div>
              <div style={{ background: 'var(--color-surface-2)', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
                <Row label="Amount" value={formatNaira(amountKobo)} strong />
                <Row label="To" value={`@${recipient.username}`} />
                <Row label="Name" value={recipient.display_name} last={!note.trim()} />
                {note.trim() && <Row label="Note" value={note.trim()} last />}
              </div>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
                By confirming, {formatNaira(amountKobo)} moves from your wallet to @{recipient.username}&rsquo;s wallet immediately. This cannot be reversed.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep('form')} style={{ flex: 1, padding: '14px', background: 'none', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', borderRadius: 12, fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
                  Back
                </button>
                <button onClick={handleSend} disabled={isPending} style={{ flex: 2, padding: '14px', background: 'var(--color-brand)', color: 'white', border: 'none', borderRadius: 12, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {isPending && <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />}
                  {isPending ? 'Sending…' : 'Confirm & send'}
                </button>
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* FORM */}
          {step === 'form' && (
            <div>
              {/* Recipient */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 8 }}>To</label>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="@username"
                  style={{ width: '100%', padding: '13px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 15, color: 'var(--color-text-primary)', fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ marginTop: 10, minHeight: 44 }}>
                  {resolving && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--color-surface-2)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
                      <Loader2 size={14} color="var(--color-text-muted)" style={{ animation: 'spin 0.8s linear infinite' }} />
                      <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Looking up user…</span>
                      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                  )}
                  {!resolving && recipient && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--color-surface-2)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-brand)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, fontFamily: "'Syne', sans-serif" }}>
                        {recipient.display_name?.[0]?.toUpperCase() || recipient.username[0].toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 600 }}>{recipient.display_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>@{recipient.username}</div>
                      </div>
                    </div>
                  )}
                  {!resolving && !recipient && username.trim().replace(/^@/, '').length >= 2 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--color-surface-2)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
                      <AlertCircle size={15} color="var(--color-error)" />
                      <span style={{ fontSize: 14, color: 'var(--color-error)' }}>User not found</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Amount */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 8 }}>Amount</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--color-text-muted)', fontFamily: "'Syne', sans-serif", fontWeight: 700 }}>₦</span>
                  <input
                    type="number"
                    value={amountKobo / 100}
                    onChange={e => setAmountKobo(Math.round(parseFloat(e.target.value || '0') * 100))}
                    min={50}
                    max={balance / 100}
                    step={50}
                    style={{ width: '100%', padding: '13px 14px 13px 30px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 16, color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif", fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Min ₦50 · Balance {formatNaira(balance)}</span>
                  <button onClick={() => setAmountKobo(balance)} style={{ fontSize: 12, color: 'var(--color-brand)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>Send all</button>
                </div>
              </div>

              {/* Note */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 8 }}>Note (optional)</label>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value.slice(0, 200))}
                  placeholder="What's this for?"
                  style={{ width: '100%', padding: '13px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 15, color: 'var(--color-text-primary)', fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <button
                onClick={handleConfirm}
                disabled={!canProceed}
                style={{ width: '100%', padding: '14px', background: canProceed ? 'var(--color-brand)' : 'var(--color-surface-2)', color: canProceed ? 'white' : 'var(--color-text-muted)', border: 'none', borderRadius: 12, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, cursor: canProceed ? 'pointer' : 'not-allowed', transition: 'background 0.15s' }}
              >
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )

  const canSend = balance >= 5_000

  return (
    <>
      <button
        onClick={() => canSend && setOpen(true)}
        disabled={!canSend}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', color: canSend ? 'var(--color-text-secondary)' : 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '11px 20px', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, cursor: canSend ? 'pointer' : 'not-allowed', transition: 'background 0.15s' }}
      >
        <Send size={16} />
        Send
      </button>
      {mounted && open && createPortal(modal, document.body)}
    </>
  )
}

function Row({ label, value, strong, last }: { label: string; value: string; strong?: boolean; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', borderBottom: last ? 'none' : '1px solid var(--color-border)' }}>
      <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: strong ? 700 : 500, color: 'var(--color-text-primary)', fontFamily: strong ? "'Syne', sans-serif" : "'DM Sans', sans-serif" }}>{value}</span>
    </div>
  )
}