// src/app/(main)/wallet/accept-monetisation-button.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptMonetisationAction } from '@/lib/actions/monetisation'
import { CheckCircle2, Loader2 } from 'lucide-react'

export default function AcceptMonetisationButton() {
  const [accepted, setAccepted] = useState(false)
  const [error, setError]       = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleAccept() {
    if (!accepted) { setError('Please accept the fair use policy to continue.'); return }
    setError('')
    startTransition(async () => {
      const r = await acceptMonetisationAction({ accepted_fair_use: true })
      if (r.error) { setError(r.error); return }
      router.refresh()
    })
  }

  return (
    <div style={{
      border: '1px solid var(--color-brand)',
      borderRadius: 14,
      padding: '16px 18px',
      marginBottom: 16,
      background: 'rgba(26,158,95,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <CheckCircle2 size={18} color="var(--color-brand)" />
        <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)' }}>
          You&apos;re eligible for monetisation
        </span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.55, marginBottom: 12 }}>
        Once enabled, you&apos;ll earn 70% of ad revenue shown against your posts. This does not require BVN — that&apos;s only needed later, when you withdraw.
      </p>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={e => { setAccepted(e.target.checked); setError('') }}
          style={{ marginTop: 3, flexShrink: 0 }}
        />
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          I have read and accept the{' '}
          <a href="/fair-use-policy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-brand)' }}>
            Creator Earnings Fair Use Policy
          </a>
        </span>
      </label>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--color-error)', marginBottom: 10 }}>{error}</p>
      )}

      <button
        onClick={handleAccept}
        disabled={isPending || !accepted}
        style={{
          width: '100%', padding: '12px', background: 'var(--color-brand)', color: 'white',
          border: 'none', borderRadius: 10, fontFamily: "'Syne', sans-serif", fontWeight: 700,
          fontSize: 14, cursor: (isPending || !accepted) ? 'not-allowed' : 'pointer',
          opacity: (isPending || !accepted) ? 0.6 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {isPending && <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} />}
        {isPending ? 'Enabling…' : 'Enable monetisation'}
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
