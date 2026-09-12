// src/app/(admin)/waitlist/invite-button.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminInviteWaitlistAction } from '@/lib/actions/admin'

export default function WaitlistInviteButton({ waitlistId, name }: { waitlistId: string; name: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function handleInvite() {
    if (!confirm(`Send invite to ${name}?`)) return
    setError(null)
    startTransition(async () => {
      const result = await adminInviteWaitlistAction(waitlistId)
      if (result?.error) { setError(result.error); return }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleInvite}
        disabled={isPending}
        className="rounded-[7px] border border-[#378ADD]/25 bg-[#378ADD]/10 px-3 py-1.5 font-display text-xs font-semibold text-[#378ADD] disabled:opacity-60"
      >
        {isPending ? 'Sending…' : 'Send invite'}
      </button>
      {error && <span className="text-[11px] text-error">{error}</span>}
    </div>
  )
}
