// src/app/(admin)/admin/verification/verification-actions.tsx
'use client'

import { useState, useTransition } from 'react'
import { adminReviewVerificationAction } from '@/lib/actions/admin'
import { CheckCircle, XCircle } from 'lucide-react'

export default function VerificationActions({ requestId }: { requestId: string }) {
  const [rejecting, setRejecting] = useState(false)
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()

  function approve() {
    startTransition(async () => {
      await adminReviewVerificationAction(requestId, 'approved')
      window.location.reload()
    })
  }

  function reject() {
    startTransition(async () => {
      await adminReviewVerificationAction(requestId, 'rejected', notes || 'Did not meet criteria')
      window.location.reload()
    })
  }

  if (rejecting) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
        <input
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Reason"
          autoFocus
          style={{ background: '#131318', border: '1px solid #1E1E26', borderRadius: 7, padding: '6px 10px', color: '#F0F0EC', fontSize: 12, outline: 'none', width: 140 }}
        />
        <button onClick={reject} disabled={isPending} style={{ background: '#E53935', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          {isPending ? '…' : 'Confirm'}
        </button>
        <button onClick={() => setRejecting(false)} style={{ background: 'transparent', color: '#6A6A60', border: '1px solid #2A2A30', borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
      <button onClick={() => setRejecting(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(229,57,53,0.1)', border: '1px solid rgba(229,57,53,0.25)', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', color: '#E53935', fontSize: 12, fontWeight: 600 }}>
        <XCircle size={13} /> Reject
      </button>
      <button onClick={approve} disabled={isPending} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(26,158,95,0.12)', border: '1px solid rgba(26,158,95,0.25)', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', color: '#1A9E5F', fontSize: 12, fontWeight: 600 }}>
        <CheckCircle size={13} /> {isPending ? '…' : 'Approve'}
      </button>
    </div>
  )
}