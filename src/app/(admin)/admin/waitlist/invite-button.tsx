// src/app/(admin)/admin/waitlist/invite-button.tsx
'use client'

import { useTransition } from 'react'
import { adminInviteWaitlistAction } from '@/lib/actions/admin'

export default function WaitlistInviteButton({ waitlistId, name }: { waitlistId: string; name: string }) {
  const [isPending, startTransition] = useTransition()

  function handleInvite() {
    if (!confirm(`Send invite to ${name}?`)) return
    startTransition(async () => {
      await adminInviteWaitlistAction(waitlistId)
      window.location.reload()
    })
  }

  return (
    <button
      onClick={handleInvite}
      disabled={isPending}
      style={{
        background: 'rgba(55,138,221,0.1)', border: '1px solid rgba(55,138,221,0.25)',
        borderRadius: 7, padding: '5px 12px', cursor: 'pointer',
        color: '#378ADD', fontSize: 12, fontWeight: 600,
        fontFamily: "'Syne', sans-serif", transition: 'background 0.12s',
      }}
    >
      {isPending ? 'Sending…' : 'Send invite'}
    </button>
  )
}