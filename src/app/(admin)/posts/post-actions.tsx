// src/app/(admin)/posts/post-actions.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminDeletePostAction } from '@/lib/actions/admin'
import RemovalReasonField, { isRemovalReasonValid } from '@/components/admin/removal-reason-field'
import { Trash2 } from 'lucide-react'

export default function AdminPostActions({ postId }: { postId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function close() {
    setConfirming(false)
    setReason('')
    setError(null)
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const result = await adminDeletePostAction(postId, reason)
      if (result?.error) {
        setError(result.error)
        return
      }
      close()
      router.refresh()
    })
  }

  if (confirming) {
    return (
      <div className="flex w-[260px] max-w-full flex-col items-end gap-2">
        <RemovalReasonField value={reason} onChange={setReason} disabled={isPending} />
        <div className="flex gap-1.5">
          <button
            onClick={handleDelete}
            disabled={isPending || !isRemovalReasonValid(reason)}
            className="rounded-[7px] bg-error px-3 py-1.5 font-display text-xs font-bold text-white disabled:opacity-50"
          >
            {isPending ? '…' : 'Remove & notify'}
          </button>
          <button
            onClick={close}
            disabled={isPending}
            className="rounded-[7px] border border-[#2A2A30] bg-[#1A1A20] px-2.5 py-1.5 text-xs text-secondary"
          >
            Cancel
          </button>
        </div>
        {error && <span className="text-right text-[11px] text-error">{error}</span>}
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title="Remove post"
      className="flex items-center gap-1.5 rounded-[7px] border border-error/20 bg-error/[0.08] px-2.5 py-1.5 text-xs text-error"
    >
      <Trash2 size={13} /> Remove
    </button>
  )
}
