'use client'

// src/app/(admin)/flagged/flag-actions.tsx

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle } from 'lucide-react'
import {
  adminResolveFlagAction, adminDeletePostAction, adminUpdateUserAction, adminWarnUserAction,
} from '@/lib/actions/admin'

interface FlagActionsProps {
  flagId: string
  /** Set only when the flagged post was published and still exists. */
  postId: string | null
  userId: string
}

export default function FlagActions({ flagId, postId, userId }: FlagActionsProps) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function resolve(decision: 'dismiss' | 'action_taken', extra?: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      if (extra) {
        const r = await extra()
        if (r?.error) { setError(r.error); return }
      }
      const result = await adminResolveFlagAction(flagId, decision, notes || undefined)
      if (result?.error) { setError(result.error); return }
      router.refresh()
    })
  }

  if (!expanded) {
    return (
      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
        <div className="flex gap-2">
          <button
            onClick={() => resolve('dismiss')}
            disabled={isPending}
            title="Dismiss - fine to leave as is"
            className="flex items-center gap-1.5 rounded-lg border border-[#2A2A30] bg-[#1A1A20] px-3.5 py-2 font-display text-[13px] font-semibold text-secondary disabled:opacity-60"
          >
            <XCircle size={14} /> Dismiss
          </button>
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center gap-1.5 rounded-lg border border-error/25 bg-error/10 px-3.5 py-2 font-display text-[13px] font-semibold text-error"
          >
            <CheckCircle size={14} /> Take action
          </button>
        </div>
        {error && <span className="max-w-[220px] text-right text-[11px] text-error">{error}</span>}
      </div>
    )
  }

  return (
    <div className="min-w-[220px] rounded-[10px] border border-border bg-[color:var(--color-surface-2)] p-3.5">
      <p className="mb-2.5 text-xs font-semibold text-secondary">CHOOSE ACTION</p>

      <div className="mb-3 flex flex-col gap-1.5">
        {postId && (
          <ActionButton
            label="Remove post + resolve"
            color="#E53935"
            disabled={isPending}
            onClick={() => resolve('action_taken', () => adminDeletePostAction(postId, 'Removed for breaking the content rules'))}
          />
        )}
        <ActionButton
          label="Warn user + resolve"
          color="#D4A017"
          disabled={isPending}
          onClick={() => resolve('action_taken', () => adminWarnUserAction(userId, 'Your recent post broke our content rules. Repeated breaches can lead to suspension.'))}
        />
        <ActionButton
          label="Suspend user + resolve"
          color="#E53935"
          disabled={isPending}
          onClick={() => resolve('action_taken', () => adminUpdateUserAction({ userId, action: 'suspend' }))}
        />
      </div>

      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Optional internal notes…"
        rows={2}
        className="mb-2 w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-2 text-xs text-primary outline-none"
      />

      {error && <p className="mb-2 text-[11px] text-error">{error}</p>}

      <button onClick={() => { setExpanded(false); setError(null) }} className="w-full text-center text-xs text-faint">
        Cancel
      </button>
    </div>
  )
}

function ActionButton({ label, color, onClick, disabled }: { label: string; color: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-lg px-3 py-2 text-left font-display text-xs font-semibold disabled:opacity-60"
      style={{ background: `${color}12`, border: `1px solid ${color}30`, color }}
    >
      {label}
    </button>
  )
}
