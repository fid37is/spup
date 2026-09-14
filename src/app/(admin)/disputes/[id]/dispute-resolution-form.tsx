// src/app/(admin)/disputes/[id]/dispute-resolution-form.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminResolveDisputeAction } from '@/lib/actions/escrow-admin'
import { formatNaira } from '@/lib/utils'

type ResolutionType = 'release_to_seller' | 'refund_to_buyer' | 'split'

const OPTIONS: { value: ResolutionType; label: string; color: string }[] = [
  { value: 'release_to_seller', label: 'Release to seller',  color: '#1A9E5F' },
  { value: 'refund_to_buyer',   label: 'Refund to buyer',    color: '#D4A017' },
  { value: 'split',             label: 'Split between both', color: '#378ADD' },
]

export default function DisputeResolutionForm({ disputeId, amountKobo }: { disputeId: string; amountKobo: number }) {
  const [resolution, setResolution] = useState<ResolutionType | null>(null)
  const [sellerNaira, setSellerNaira] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const sellerKobo = Math.round((parseFloat(sellerNaira) || 0) * 100)
  const buyerKobo = amountKobo - sellerKobo
  const splitValid = resolution !== 'split' || (sellerKobo >= 0 && sellerKobo <= amountKobo)

  function handleSubmit() {
    setError(null)
    if (!resolution) { setError('Choose a resolution'); return }
    if (!notes.trim()) { setError('A resolution note is required for the audit trail'); return }
    if (resolution === 'split' && !splitValid) { setError('Seller amount must be between ₦0 and the full order amount'); return }

    startTransition(async () => {
      const result = await adminResolveDisputeAction({
        disputeId,
        resolution,
        splitSellerKobo: resolution === 'split' ? sellerKobo : undefined,
        splitBuyerKobo: resolution === 'split' ? buyerKobo : undefined,
        resolutionNotes: notes.trim(),
      })
      if (result?.error) { setError(result.error); return }
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="mb-3.5 text-[11px] font-bold tracking-wide text-faint">RESOLVE THIS DISPUTE</div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        {OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setResolution(opt.value)}
            className="flex-1 rounded-lg border px-3.5 py-2.5 text-left font-display text-[13px] font-semibold transition-colors"
            style={{
              borderColor: resolution === opt.value ? opt.color : 'var(--color-border)',
              background: resolution === opt.value ? `${opt.color}14` : 'transparent',
              color: resolution === opt.value ? opt.color : 'var(--color-text-secondary)',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {resolution === 'split' && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-secondary">Amount to seller (₦)</label>
            <input
              type="number"
              min={0}
              max={amountKobo / 100}
              step="0.01"
              value={sellerNaira}
              onChange={e => setSellerNaira(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-border bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-primary outline-none"
            />
          </div>
          <div className="flex-1 text-[13px] text-faint sm:pb-2.5">
            Buyer gets {formatNaira(Math.max(buyerKobo, 0))} of {formatNaira(amountKobo)} total
          </div>
        </div>
      )}

      <div className="mb-3.5">
        <label className="mb-1 block text-xs text-secondary">Resolution note (required — goes in the audit log)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Why this outcome — what the evidence showed, what was agreed, etc."
          className="w-full resize-none rounded-lg border border-border bg-[color:var(--color-surface-2)] px-3 py-2.5 text-sm text-primary outline-none"
        />
      </div>

      {error && <p className="mb-3 text-[13px] text-error">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={isPending || !resolution}
        className="w-full rounded-lg bg-brand py-2.5 font-display text-sm font-bold text-white disabled:opacity-50 sm:w-auto sm:px-6"
      >
        {isPending ? 'Resolving…' : 'Resolve dispute'}
      </button>
    </div>
  )
}
