'use client'

// src/app/(main)/wallet/topup/page.tsx
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowLeft, AlertCircle, Loader2 } from 'lucide-react'
import { formatNaira } from '@/lib/utils'

const QUICK_AMOUNTS_KOBO = [50_000, 100_000, 500_000, 1_000_000] // ₦500, ₦1k, ₦5k, ₦10k

export default function TopUpPage() {
  const [amountKobo, setAmountKobo] = useState(0)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

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

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '14px 20px',
      }}>
        <Link href="/wallet" style={{ color: 'var(--color-text-primary)', display: 'flex' }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)' }}>
          Top up wallet
        </h1>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
          Add money to your wallet with your card or by bank transfer — you'll choose on the next screen. You can use this balance to pay vendors on Spup securely — funds stay in escrow until you confirm you've received what you paid for.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {QUICK_AMOUNTS_KOBO.map(a => (
            <button
              key={a}
              onClick={() => { setAmountKobo(a); setError('') }}
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
            onChange={e => { setAmountKobo(Math.round(Number(e.target.value || 0) * 100)); setError('') }}
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
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 12 }}>
          You'll be taken to Paystack's secure checkout to complete the payment.
        </p>
      </div>
    </div>
  )
}