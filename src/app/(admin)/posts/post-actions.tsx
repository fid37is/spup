// src/app/(admin)/admin/posts/post-actions.tsx
'use client'

import { useState, useTransition } from 'react'
import { adminDeletePostAction } from '@/lib/actions/admin'
import { Trash2 } from 'lucide-react'

export default function AdminPostActions({ postId }: { postId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      await adminDeletePostAction(postId, 'Removed by admin')
      window.location.reload()
    })
  }

  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={handleDelete}
          disabled={isPending}
          style={{ background: '#E53935', color: 'white', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}
        >
          {isPending ? '…' : 'Confirm'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          style={{ background: '#1A1A20', color: '#8A8A85', border: '1px solid #2A2A30', borderRadius: 7, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title="Remove post"
      style={{ background: 'rgba(229,57,53,0.08)', border: '1px solid rgba(229,57,53,0.2)', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', color: '#E53935', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
    >
      <Trash2 size={13} /> Remove
    </button>
  )
}