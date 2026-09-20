// src/app/(admin)/users/[id]/data-request-panel.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Loader2 } from 'lucide-react'
import { ExportButton } from '@/components/admin/export-button'
import { adminEmailUserDataAction } from '@/lib/actions/admin'

export default function UserDataRequestPanel({ userId, email }: { userId: string; email: string | null }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const router = useRouter()

  function handleEmail() {
    if (!email) return
    if (!window.confirm(`Email a copy of this user's data to ${email}?\n\nThe file contains their personal information and is sent to the address on their account only.`)) return

    setResult(null)
    startTransition(async () => {
      const res = await adminEmailUserDataAction(userId)
      if (res?.error) {
        setResult({ tone: 'error', text: res.error })
        return
      }
      setResult({ tone: 'ok', text: `Sent to ${res.sentTo}` })
      router.refresh() // shows the new entry in Admin history
    })
  }

  return (
    <div className="px-4 py-4">
      <p className="mb-3 text-[13px] leading-relaxed text-faint">
        For data-access requests. The export covers profile, posts, wallet and transactions, follows,
        notifications and related activity. Direct messages (end-to-end encrypted) and security
        credentials are never included. Every export is recorded in Admin history.
      </p>

      <div className="flex flex-wrap items-start gap-2.5">
        <ExportButton href={`/api/admin/export/user/${userId}`} label="Download data (JSON)" />

        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={handleEmail}
            disabled={isPending || !email}
            title={email ? undefined : 'This user has no email address on file'}
            className="flex items-center gap-2 rounded-[9px] border border-border bg-surface px-3.5 py-2.5 text-[13px] font-semibold text-secondary transition-colors hover:text-primary disabled:opacity-60"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            {isPending ? 'Sending…' : 'Email data to user'}
          </button>
          {!email && <span className="text-[11px] text-faint">No email on file - download instead.</span>}
          {result && (
            <span role="status" className={`max-w-[260px] text-[11px] ${result.tone === 'error' ? 'text-error' : 'text-faint'}`}>
              {result.text}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
