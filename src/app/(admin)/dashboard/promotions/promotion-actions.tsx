// src/app/(admin)/admin/promotions/promotion-actions.tsx
'use client'

import { useState, useTransition } from 'react'
import { adminCancelPromotionAction } from '@/lib/actions/admin'

export default function PromotionActions({ promotionId }: { promotionId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  function cancel() {
    startTransition(async () => {
      await adminCancelPromotionAction(promotionId, 'Cancelled by admin')
      window.location.reload()
    })
  }

  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          onClick={cancel}
          disabled={isPending}
          style={{ background: '#E53935', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          {isPending ? '…' : 'Confirm'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          style={{ background: 'transparent', color: '#6A6A60', border: '1px solid #2A2A30', borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      style={{ background: 'transparent', border: '1px solid rgba(229,57,53,0.25)', color: '#E53935', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
    >
      Stop promotion
    </button>
  )
}