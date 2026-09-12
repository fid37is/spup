// src/app/(admin)/ads/ad-review-actions.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminUpdateAdAction } from '@/lib/actions/admin'
import { CheckCircle, XCircle } from 'lucide-react'

export default function AdReviewActions({ adId }: { adId: string }) {
  const [rejecting, setRejecting] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function approve() {
    setError(null)
    startTransition(async () => {
      const result = await adminUpdateAdAction(adId, 'active')
      if (result?.error) { setError(result.error); return }
      router.refresh()
    })
  }

  function reject() {
    setError(null)
    startTransition(async () => {
      const result = await adminUpdateAdAction(adId, 'rejected', notes || 'Does not meet advertising guidelines')
      if (result?.error) { setError(result.error); return }
      router.refresh()
    })
  }

  if (rejecting) {
    return (
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:gap-2">
        <div className="flex-1 sm:flex-none">
          <label className="mb-1 block text-[11px] text-secondary">Rejection reason</label>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. misleading content"
            autoFocus
            className="w-full rounded-[7px] border border-border bg-[color:var(--color-surface-2)] px-3 py-2 text-[13px] text-primary outline-none sm:w-[220px]"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={reject}
            disabled={isPending}
            className="rounded-lg bg-error px-4 py-2 font-display text-[13px] font-bold text-white disabled:opacity-60"
          >
            {isPending ? '…' : 'Confirm reject'}
          </button>
          <button
            onClick={() => { setRejecting(false); setError(null) }}
            className="rounded-lg border border-[#2A2A30] bg-[#1A1A20] px-3 py-2 text-[13px] text-secondary"
          >
            Cancel
          </button>
        </div>
        {error && <span className="text-[11px] text-error sm:ml-2">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        <button
          onClick={() => setRejecting(true)}
          className="flex items-center gap-1.5 rounded-lg border border-error/25 bg-error/10 px-4 py-2 font-display text-[13px] font-semibold text-error"
        >
          <XCircle size={15} /> Reject
        </button>
        <button
          onClick={approve}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-lg border border-brand/25 bg-brand-muted px-4 py-2 font-display text-[13px] font-semibold text-brand disabled:opacity-60"
        >
          <CheckCircle size={15} /> {isPending ? 'Approving…' : 'Approve & publish'}
        </button>
      </div>
      {error && <span className="text-[11px] text-error">{error}</span>}
    </div>
  )
}
