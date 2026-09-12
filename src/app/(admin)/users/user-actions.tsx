// src/app/(admin)/users/user-actions.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { adminUpdateUserAction } from '@/lib/actions/admin'
import { MoreHorizontal, Loader2 } from 'lucide-react'

// Actions that meaningfully change what a user can do or see — worth a
// confirmation step so a stray tap doesn't ban someone or hand out
// moderator access.
const CONFIRM_COPY: Partial<Record<string, string>> = {
  ban: 'Permanently ban this account? This also removes their content and cannot be undone from here.',
  make_moderator: 'Promote this user to moderator? They will gain access to the admin panel.',
  revoke_moderator: "Revoke this user's moderator access?",
}

export default function AdminUserActions({ userId, currentStatus, currentRole }: {
  userId: string; currentStatus: string; currentRole: string
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function doAction(action: string) {
    const confirmMessage = CONFIRM_COPY[action]
    if (confirmMessage && !window.confirm(confirmMessage)) return

    setOpen(false)
    setError(null)
    startTransition(async () => {
      const result = await adminUpdateUserAction({ userId, action: action as any })
      if (result?.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center rounded-[7px] border border-[#2A2A30] bg-[#1A1A20] px-2.5 py-1.5 text-secondary"
        aria-label="User actions"
      >
        <MoreHorizontal size={15} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-10" />
          <div className="absolute right-0 top-[34px] z-20 min-w-[180px] overflow-hidden rounded-lg border border-[#2A2A30] bg-[color:var(--color-surface-2)] shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
            {currentStatus !== 'suspended' && (
              <MenuItem label="Suspend 7 days" color="#D4A017" onClick={() => doAction('suspend')} />
            )}
            {currentStatus === 'suspended' && (
              <MenuItem label="Lift suspension" color="#1A9E5F" onClick={() => doAction('unsuspend')} />
            )}
            {currentStatus !== 'banned' && (
              <MenuItem label="Permanent ban" color="#E53935" onClick={() => doAction('ban')} />
            )}
            {currentStatus === 'banned' && (
              <MenuItem label="Unban account" color="#1A9E5F" onClick={() => doAction('unban')} />
            )}
            <div className="my-1 h-px bg-border" />
            {currentRole === 'user' && (
              <MenuItem label="Promote to moderator" color="#378ADD" onClick={() => doAction('make_moderator')} />
            )}
            {currentRole === 'moderator' && (
              <MenuItem label="Revoke moderator" color="#D4A017" onClick={() => doAction('revoke_moderator')} />
            )}
            <div className="my-1 h-px bg-border" />
            <Link
              href={`/users/${userId}`}
              className="block w-full px-3.5 py-2.5 text-left text-[13px] text-secondary no-underline"
            >
              View full profile
            </Link>
          </div>
        </>
      )}

      {error && (
        <div className="absolute right-0 top-[34px] z-30 w-56 rounded-lg border border-error/30 bg-[color:var(--color-surface-2)] p-3 text-xs text-error shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {isPending && (
        <div className="absolute inset-0 flex items-center justify-center rounded-[7px] bg-black/60">
          <Loader2 size={14} className="animate-spin text-brand" />
        </div>
      )}
    </div>
  )
}

function MenuItem({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full px-3.5 py-2.5 text-left text-[13px] transition-colors"
      style={{ color }}
    >
      {label}
    </button>
  )
}
