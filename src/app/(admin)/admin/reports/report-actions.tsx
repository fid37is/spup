// src/app/(admin)/admin/reports/report-actions.tsx
'use client'

import { useState, useTransition } from 'react'
import { adminResolveReportAction, adminDeletePostAction, adminUpdateUserAction } from '@/lib/actions/admin'
import { CheckCircle, XCircle } from 'lucide-react'

interface ReportActionsProps {
  reportId: string
  entityType: string
  entityId: string
}

export default function ReportActions({ reportId, entityType, entityId }: ReportActionsProps) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()

  function resolve(decision: 'dismiss' | 'action_taken', extraAction?: () => Promise<unknown>) {
    startTransition(async () => {
      if (extraAction) await extraAction()
      await adminResolveReportAction(reportId, decision, notes || undefined)
      window.location.reload()
    })
  }

  if (!expanded) {
    return (
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => resolve('dismiss')}
          disabled={isPending}
          title="Dismiss — no action needed"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1A1A20', border: '1px solid #2A2A30', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', color: '#6A6A60', fontSize: 13, fontFamily: "'Syne', sans-serif", fontWeight: 600 }}
        >
          <XCircle size={14} /> Dismiss
        </button>
        <button
          onClick={() => setExpanded(true)}
          title="Take action — remove content or warn user"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(229,57,53,0.1)', border: '1px solid rgba(229,57,53,0.25)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', color: '#E53935', fontSize: 13, fontFamily: "'Syne', sans-serif", fontWeight: 600 }}
        >
          <CheckCircle size={14} /> Take action
        </button>
      </div>
    )
  }

  return (
    <div style={{ background: '#131318', border: '1px solid #1E1E26', borderRadius: 10, padding: 14, minWidth: 220 }}>
      <p style={{ fontSize: 12, color: '#6A6A60', marginBottom: 10, fontWeight: 600 }}>CHOOSE ACTION</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
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
        <ActionButton
          label="Suspend user + resolve"
          color="#E53935"
          onClick={() => resolve('action_taken', () => adminUpdateUserAction({ userId: entityId, action: 'suspend' }))}
          disabled={isPending}
        />
      </div>

      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Optional internal notes…"
        rows={2}
        style={{ width: '100%', background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 7, padding: '8px 10px', color: '#F0F0EC', fontSize: 12, resize: 'none', outline: 'none', fontFamily: "'DM Sans', sans-serif", marginBottom: 8 }}
      />

      <button
        onClick={() => setExpanded(false)}
        style={{ fontSize: 12, color: '#44444A', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'center' }}
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
      style={{ width: '100%', padding: '8px 12px', background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 8, color, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Syne', sans-serif", textAlign: 'left', transition: 'background 0.12s' }}
    >
      {label}
    </button>
  )
}