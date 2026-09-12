// src/app/(admin)/promotions/promotion-actions.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminCancelPromotionAction } from '@/lib/actions/admin'

export default function PromotionActions({ promotionId }: { promotionId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function cancel() {
    setError(null)
    startTransition(async () => {
      const result = await adminCancelPromotionAction(promotionId, 'Cancelled by admin')
      if (result?.error) { setError(result.error); return }
      router.refresh()
    })
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex justify-end gap-1.5">
          <button
            onClick={cancel}
            disabled={isPending}
            className="rounded-[7px] bg-error px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
          >
            {isPending ? '…' : 'Confirm'}
          </button>
          <button
            onClick={() => { setConfirming(false); setError(null) }}
            className="rounded-[7px] border border-[#2A2A30] bg-transparent px-3 py-1.5 text-xs text-secondary"
          >
            Cancel
          </button>
        </div>
        {error && <span className="text-[11px] text-error">{error}</span>}
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded-[7px] border border-error/25 bg-transparent px-3 py-1.5 text-xs font-semibold text-error"
    >
      Stop promotion
    </button>
  )
}
