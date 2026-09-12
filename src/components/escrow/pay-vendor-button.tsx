'use client'

// src/components/escrow/pay-vendor-button.tsx
import { useState, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { ShieldCheck, X, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { formatNaira } from '@/lib/utils'
import { payVendorAction } from '@/lib/actions/escrow'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Step = 'form' | 'success' | 'error'

interface PayVendorButtonProps {
  sellerUsername: string
  sellerDisplayName: string
  postId?: string
  /** Compact icon-only variant for embedding in a post's action bar. */
  compact?: boolean
}

export default function PayVendorButton({ sellerUsername, sellerDisplayName, postId, compact }: PayVendorButtonProps) {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('form')
  const [amountKobo, setAmountKobo] = useState(0)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [orderId, setOrderId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => { setMounted(true) }, [])

  function handleClose() {
    setOpen(false)
    setTimeout(() => { setStep('form'); setAmountKobo(0); setNote(''); setError('') }, 300)
  }

  function handlePay() {
    if (amountKobo < 10_000) { setError('Minimum payment is ₦100'); return }
    setError('')
    startTransition(async () => {
      const result = await payVendorAction({ sellerUsername, postId, amountKobo, note: note.trim() || undefined })
      if (result.error) { setError(result.error); setStep('error'); return }
      setOrderId(result.orderId ?? null)
      setStep('success')
      router.refresh()
    })
  }

  const modal = (
    <>
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
        background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)',
        borderRadius: '20px 20px 0 0', maxHeight: '92dvh', overflowY: 'auto',
        animation: 'slideUp 0.25s cubic-bezier(0.4,0,0.2,1)', maxWidth: 560, margin: '0 auto',
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } } @keyframes spin { to { transform: rotate(360deg); } }`}</style>

        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 16px' }}>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)' }}>
            {step === 'success' ? 'Payment held in escrow' : step === 'error' ? 'Payment failed' : `Pay @${sellerUsername}`}
          </h2>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '0 20px 40px' }}>

          {step === 'success' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <CheckCircle size={32} color="var(--color-brand)" />
              </div>
              <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, color: 'var(--color-text-primary)', marginBottom: 8 }}>
                {formatNaira(amountKobo)} held safely
              </p>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
                @{sellerUsername} won't be able to withdraw this until you confirm you've received your item. If anything goes wrong, you can open a dispute any time before then.
              </p>
              {orderId && (
                <Link href={`/wallet/orders/${orderId}`} onClick={handleClose} style={{ display: 'block', width: '100%', padding: '14px', background: 'var(--color-brand)', color: 'white', border: 'none', borderRadius: 12, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, textDecoration: 'none', boxSizing: 'border-box' }}>
                  View order
                </Link>
              )}
            </div>
          )}

          {step === 'error' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <AlertCircle size={32} color="var(--color-error)" />
              </div>
              <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 8 }}>Couldn't complete payment</p>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 28 }}>{error}</p>
              <button onClick={() => setStep('form')} style={{ width: '100%', padding: '14px', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: 12, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                Try again
              </button>
            </div>
          )}

          {step === 'form' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--color-surface-2)', borderRadius: 12, marginBottom: 20 }}>
                <ShieldCheck size={16} color="var(--color-brand)" />
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  Held safely until you confirm delivery — {sellerDisplayName} can't withdraw it before then.
                </span>
              </div>

              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 8 }}>
                Amount
              </label>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--color-border)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
                <span style={{ fontSize: 16, color: 'var(--color-text-muted)', marginRight: 6 }}>₦</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={amountKobo ? amountKobo / 100 : ''}
                  onChange={e => setAmountKobo(Math.round(Number(e.target.value || 0) * 100))}
                  placeholder="0"
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif" }}
                />
              </div>

              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 8 }}>
                Note to vendor (optional)
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. black hoodie, size M, deliver to Ikeja"
                rows={2}
                style={{ width: '100%', border: '1px solid var(--color-border)', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: 'var(--color-text-primary)', background: 'none', outline: 'none', resize: 'none', marginBottom: 20, boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif" }}
              />

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--color-surface-2)', borderRadius: 12, border: '1px solid var(--color-border)', marginBottom: 20 }}>
                  <AlertCircle size={15} color="var(--color-error)" />
                  <span style={{ fontSize: 13, color: 'var(--color-error)' }}>{error}</span>
                </div>
              )}

              <button
                onClick={handlePay}
                disabled={isPending || amountKobo < 10_000}
                style={{
                  width: '100%', padding: '14px',
                  background: amountKobo >= 10_000 ? 'var(--color-brand)' : 'var(--color-surface-2)',
                  color: amountKobo >= 10_000 ? 'white' : 'var(--color-text-muted)',
                  border: 'none', borderRadius: 12, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {isPending && <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />}
                {isPending ? 'Processing…' : `Pay ${amountKobo ? formatNaira(amountKobo) : ''}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )

  return (
    <>
      {compact ? (
        <button onClick={() => setOpen(true)} title={`Pay @${sellerUsername}`} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--color-brand)', cursor: 'pointer', padding: '6px 8px', fontSize: 13, fontWeight: 600 }}>
          <ShieldCheck size={16} />
          Pay
        </button>
      ) : (
        <button onClick={() => setOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-brand)', color: 'white', border: 'none', borderRadius: 10, padding: '11px 20px', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          <ShieldCheck size={16} />
          Pay @{sellerUsername}
        </button>
      )}
      {mounted && open && createPortal(modal, document.body)}
    </>
  )
}
