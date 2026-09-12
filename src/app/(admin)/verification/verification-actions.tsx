// src/app/(admin)/verification/verification-actions.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminReviewVerificationAction } from '@/lib/actions/admin'
import { CheckCircle, XCircle } from 'lucide-react'

export default function VerificationActions({ requestId }: { requestId: string }) {
  const [rejecting, setRejecting] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function approve() {
    setError(null)
    startTransition(async () => {
      const result = await adminReviewVerificationAction(requestId, 'approved')
      if (result?.error) { setError(result.error); return }
      router.refresh()
    })
  }

  function reject() {
    setError(null)
    startTransition(async () => {
      const result = await adminReviewVerificationAction(requestId, 'rejected', notes || 'Did not meet criteria')
      if (result?.error) { setError(result.error); return }
      router.refresh()
    })
  }

  if (rejecting) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Reason"
            autoFocus
            className="w-[130px] rounded-[7px] border border-border bg-[color:var(--color-surface-2)] px-2.5 py-1.5 text-xs text-primary outline-none"
          />
          <button onClick={reject} disabled={isPending} className="rounded-[7px] bg-error px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
            {isPending ? '…' : 'Confirm'}
          </button>
          <button onClick={() => { setRejecting(false); setError(null) }} className="rounded-[7px] border border-[#2A2A30] bg-transparent px-3 py-1.5 text-xs text-secondary">
            Cancel
          </button>
        </div>
        {error && <span className="text-[11px] text-error">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex justify-end gap-1.5">
        <button onClick={() => setRejecting(true)} className="flex items-center gap-1 rounded-[7px] border border-error/25 bg-error/10 px-3 py-1.5 text-xs font-semibold text-error">
          <XCircle size={13} /> Reject
        </button>
        <button onClick={approve} disabled={isPending} className="flex items-center gap-1 rounded-[7px] border border-brand/25 bg-brand-muted px-3 py-1.5 text-xs font-semibold text-brand disabled:opacity-60">
          <CheckCircle size={13} /> {isPending ? '…' : 'Approve'}
        </button>
      </div>
      {error && <span className="text-[11px] text-error">{error}</span>}
    </div>
  )
}
