'use client'

// src/app/(main)/wallet/topup-button.tsx
import { useState, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, AlertCircle, Loader2 } from 'lucide-react'
import { formatNaira } from '@/lib/utils'

const QUICK_AMOUNTS_KOBO = [50_000, 100_000, 500_000, 1_000_000] // ₦500, ₦1k, ₦5k, ₦10k

export default function TopUpButton() {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [amountKobo, setAmountKobo] = useState(0)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => { setMounted(true) }, [])

  function handleClose() {
    setOpen(false)
    setTimeout(() => { setAmountKobo(0); setError('') }, 300)
  }

  function handleTopUp() {
    if (amountKobo < 50_000) { setError('Minimum top-up is ₦500'); return }
    setError('')
    startTransition(async () => {
      try {
        const res = await fetch('/api/wallet/topup/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount_kobo: amountKobo }),
        })
        const data = await res.json()
        if (!res.ok || data.error) { setError(data.error || 'Could not start top-up.'); return }
        // Hand off to Paystack — same redirect pattern as post promotion checkout.
        window.location.href = data.authorization_url
      } catch {
        setError('Network error. Please try again.')
      }
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
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } } @keyframes spin { to { transform: rotate(360deg); } }`}</style>

        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 16px' }}>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)' }}>
            Top up wallet
          </h2>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '0 20px 40px' }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
            Add money to your wallet with your card. You can use this balance to pay vendors on Spup securely — funds stay in escrow until you confirm you've received what you paid for.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {QUICK_AMOUNTS_KOBO.map(a => (
              <button
                key={a}
                onClick={() => setAmountKobo(a)}
                style={{
                  flex: '1 0 40%', padding: '10px', borderRadius: 10,
                  border: `1px solid ${amountKobo === a ? 'var(--color-brand)' : 'var(--color-border)'}`,
                  background: amountKobo === a ? 'var(--color-surface-2)' : 'none',
                  color: amountKobo === a ? 'var(--color-brand)' : 'var(--color-text-secondary)',
                  fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, cursor: 'pointer',
                }}
              >
                {formatNaira(a)}
              </button>
            ))}
          </div>

          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 8 }}>
            Or enter a custom amount
          </label>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--color-border)', borderRadius: 12, padding: '12px 14px', marginBottom: 20 }}>
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

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--color-surface-2)', borderRadius: 12, border: '1px solid var(--color-border)', marginBottom: 20 }}>
              <AlertCircle size={15} color="var(--color-error)" />
              <span style={{ fontSize: 13, color: 'var(--color-error)' }}>{error}</span>
            </div>
          )}

          <button
            onClick={handleTopUp}
            disabled={isPending || amountKobo < 50_000}
            style={{
              width: '100%', padding: '14px',
              background: amountKobo >= 50_000 ? 'var(--color-brand)' : 'var(--color-surface-2)',
              color: amountKobo >= 50_000 ? 'white' : 'var(--color-text-muted)',
              border: 'none', borderRadius: 12, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
              cursor: isPending ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {isPending && <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />}
            {isPending ? 'Redirecting…' : 'Continue to payment'}
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '11px 20px', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
      >
        <Plus size={16} />
        Top up
      </button>
      {mounted && open && createPortal(modal, document.body)}
    </>
  )
}
