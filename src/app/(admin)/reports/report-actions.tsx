// src/app/(admin)/reports/report-actions.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminResolveReportAction, adminDeletePostAction, adminUpdateUserAction } from '@/lib/actions/admin'
import { CheckCircle, XCircle } from 'lucide-react'

interface ReportActionsProps {
  reportId: string
  entityType: string
  entityId: string
  /** The actual account to act on — for post reports this is the post's
      author, not the post id itself. Null when we couldn't resolve one
      (e.g. the post was already deleted, or the entity is a comment). */
  targetUserId: string | null
}

export default function ReportActions({ reportId, entityType, entityId, targetUserId }: ReportActionsProps) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function resolve(decision: 'dismiss' | 'action_taken', extraAction?: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      if (extraAction) {
        const extraResult = await extraAction()
        if (extraResult?.error) {
          setError(extraResult.error)
          return
        }
      }
      const result = await adminResolveReportAction(reportId, decision, notes || undefined)
      if (result?.error) {
        setError(result.error)
        return
      }
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
            title="Dismiss — no action needed"
            className="flex items-center gap-1.5 rounded-lg border border-[#2A2A30] bg-[#1A1A20] px-3.5 py-2 font-display text-[13px] font-semibold text-secondary disabled:opacity-60"
          >
            <XCircle size={14} /> Dismiss
          </button>
          <button
            onClick={() => setExpanded(true)}
            title="Take action — remove content or warn user"
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
        {entityType === 'post' && (
          <ActionButton
            label="Remove post + resolve"
            color="#E53935"
            onClick={() => resolve('action_taken', () => adminDeletePostAction(entityId, 'Removed via report'))}
            disabled={isPending}
          />
        )}
        <ActionButton
          label="Warn user + resolve"
          color="#D4A017"
          onClick={() => resolve('action_taken')}
          disabled={isPending}
        />
        {targetUserId ? (
          <ActionButton
            label="Suspend user + resolve"
            color="#E53935"
            onClick={() => resolve('action_taken', () => adminUpdateUserAction({ userId: targetUserId, action: 'suspend' }))}
            disabled={isPending}
          />
        ) : (
          <p className="px-1 py-1 text-[11px] text-faint">
            Can't resolve a target account to suspend for this {entityType}.
          </p>
        )}
      </div>

      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Optional internal notes…"
        rows={2}
        className="mb-2 w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-2 text-xs text-primary outline-none"
      />

      {error && <p className="mb-2 text-[11px] text-error">{error}</p>}

      <button
        onClick={() => { setExpanded(false); setError(null) }}
        className="w-full text-center text-xs text-faint"
      >
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
