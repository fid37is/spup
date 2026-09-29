// src/components/feed/report-dialog.tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { submitReportAction } from '@/lib/actions/reports'
import { useToast } from '@/components/layout/toast'

type Reason = 'spam' | 'harassment' | 'hate_speech' | 'misinformation' | 'nudity' | 'violence' | 'other'

const REASONS: { value: Reason; label: string; hint: string }[] = [
  { value: 'spam',           label: 'Spam or scam',               hint: 'Fake offers, misleading links, repeated promotion' },
  { value: 'harassment',     label: 'Harassment or bullying',     hint: 'Targeting or insulting a person' },
  { value: 'hate_speech',    label: 'Hate speech',                hint: 'Attacks on a group of people' },
  { value: 'violence',       label: 'Violence or threats',        hint: 'Threatening or encouraging harm' },
  { value: 'nudity',         label: 'Nudity or sexual content',   hint: '' },
  { value: 'misinformation', label: 'False information',          hint: '' },
  { value: 'other',          label: 'Something else',             hint: '' },
]

export default function ReportDialog({
  entityType, entityId, subject, onClose,
}: {
  entityType: 'post' | 'user'
  entityId: string
  /** e.g. "post" or "@username" - shown in the title. */
  subject: string
  onClose: () => void
}) {
  const { success, error: toastError, info } = useToast()
  const [reason, setReason] = useState<Reason | null>(null)
  const [details, setDetails] = useState('')
  const [isPending, startTransition] = useTransition()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Lock background scroll while the dialog is open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  function submit() {
    if (!reason || isPending) return
    startTransition(async () => {
      const result = await submitReportAction({
        entity_id: entityId,
        entity_type: entityType,
        reason,
        details: details.trim() || undefined,
      })
      if ('error' in result) { toastError(result.error); return }
      if (result.duplicate) info('You already reported this. Our team is reviewing it.')
      else success('Report submitted. Thank you.')
      onClose()
    })
  }

  if (!mounted) return null

  return createPortal(
    <div
      onClick={e => { e.stopPropagation(); if (!isPending) onClose() }}
      className="report-dialog-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.55)',
        display: 'flex', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label={`Report ${subject}`}
        className="report-dialog-panel"
        style={{
          background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
          width: '100%', maxWidth: 440, maxHeight: '88vh', overflowY: 'auto',
          padding: '16px 18px calc(18px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 17, color: 'var(--color-text-primary)' }}>
            Report {subject}
          </h2>
          <button
            type="button" onClick={onClose} disabled={isPending} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>
          What&apos;s wrong? Your report is private.
        </p>

        <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {REASONS.map(r => {
            const active = reason === r.value
            return (
              <button
                key={r.value} type="button" role="radio" aria-checked={active}
                onClick={() => setReason(r.value)}
                style={{
                  textAlign: 'left', cursor: 'pointer', padding: '10px 12px', borderRadius: 12,
                  border: `1px solid ${active ? 'var(--color-brand)' : 'var(--color-border)'}`,
                  background: active ? 'var(--color-surface-2)' : 'transparent',
                  color: 'var(--color-text-primary)',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</div>
                {r.hint && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{r.hint}</div>}
              </button>
            )
          })}
        </div>

        <textarea
          value={details}
          onChange={e => setDetails(e.target.value.slice(0, 500))}
          placeholder="Anything else we should know? (optional)"
          rows={3}
          style={{
            width: '100%', resize: 'none', marginBottom: 12, padding: '10px 12px', borderRadius: 12,
            border: '1px solid var(--color-border)', background: 'var(--color-bg)',
            color: 'var(--color-text-primary)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
          }}
        />

        <button
          type="button" onClick={submit} disabled={!reason || isPending}
          style={{
            width: '100%', minHeight: 44, borderRadius: 22, border: 'none',
            fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
            cursor: reason && !isPending ? 'pointer' : 'not-allowed',
            background: reason ? 'var(--color-brand)' : 'var(--color-surface-3)',
            color: reason ? 'white' : 'var(--color-text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {isPending
            ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
            : 'Submit report'}
        </button>
      </div>

      <style>{`
        .report-dialog-overlay { align-items: center; }
        .report-dialog-panel { border-radius: 18px; }
        @media (max-width: 640px) {
          .report-dialog-overlay { align-items: flex-end; }
          .report-dialog-panel { border-radius: 18px 18px 0 0; max-width: none !important; }
        }
      `}</style>
    </div>,
    document.body,
  )
}
