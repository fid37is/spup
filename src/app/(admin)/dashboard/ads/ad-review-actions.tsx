// src/app/(admin)/admin/ads/ad-review-actions.tsx
'use client'

import { useState, useTransition } from 'react'
import { adminUpdateAdAction } from '@/lib/actions/admin'
import { CheckCircle, XCircle } from 'lucide-react'

export default function AdReviewActions({ adId }: { adId: string }) {
  const [rejecting, setRejecting] = useState(false)
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()

  function approve() {
    startTransition(async () => {
      await adminUpdateAdAction(adId, 'active')
      window.location.reload()
    })
  }

  function reject() {
    startTransition(async () => {
      await adminUpdateAdAction(adId, 'rejected', notes || 'Does not meet advertising guidelines')
      window.location.reload()
    })
  }

  if (rejecting) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: '#6A6A60', display: 'block', marginBottom: 4 }}>Rejection reason</label>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. misleading content"
            autoFocus
            style={{ background: '#131318', border: '1px solid #1E1E26', borderRadius: 7, padding: '7px 12px', color: '#F0F0EC', fontSize: 13, outline: 'none', fontFamily: "'DM Sans', sans-serif", width: 220 }}
          />
        </div>
        <button
          onClick={reject}
          disabled={isPending}
          style={{ background: '#E53935', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}
        >
          {isPending ? '…' : 'Confirm reject'}
        </button>
        <button
          onClick={() => setRejecting(false)}
          style={{ background: '#1A1A20', color: '#8A8A85', border: '1px solid #2A2A30', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        onClick={() => setRejecting(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(229,57,53,0.1)', border: '1px solid rgba(229,57,53,0.25)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', color: '#E53935', fontSize: 13, fontWeight: 600, fontFamily: "'Syne', sans-serif" }}
      >
        <XCircle size={15} /> Reject
      </button>
      <button
        onClick={approve}
        disabled={isPending}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(26,158,95,0.12)', border: '1px solid rgba(26,158,95,0.25)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', color: '#1A9E5F', fontSize: 13, fontWeight: 600, fontFamily: "'Syne', sans-serif" }}
      >
        <CheckCircle size={15} /> {isPending ? 'Approving…' : 'Approve & publish'}
      </button>
    </div>
  )
}