'use client'

// src/app/(main)/wallet/orders/[id]/order-actions.tsx
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle, CheckCircle, Upload, X } from 'lucide-react'
import { formatNaira } from '@/lib/utils'
import {
  markDeliveredAction,
  confirmReceiptAction,
  openDisputeAction,
  submitDisputeEvidenceAction,
  proposeResolutionAction,
  respondToProposalAction,
  escalateDisputeAction,
} from '@/lib/actions/escrow'
import { useTranslation } from '@/lib/i18n/language-context'

type DisputeReason = 'item_not_received' | 'item_not_as_described' | 'seller_unresponsive' | 'buyer_falsely_disputing' | 'other'

function reasonLabel(t: (key: string, vars?: Record<string, string | number>) => string): Record<DisputeReason, string> {
  return {
    item_not_received: t('wallet.reason_not_received'),
    item_not_as_described: t('wallet.reason_not_as_described'),
    seller_unresponsive: t('wallet.reason_seller_unresponsive'),
    buyer_falsely_disputing: t('wallet.reason_buyer_falsely_disputing'),
    other: t('wallet.reason_other'),
  }
}

function PrimaryButton({ children, onClick, disabled, pending, variant = 'primary' }: any) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--color-brand)', color: 'white', border: 'none' },
    secondary: { background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' },
    danger: { background: 'none', color: 'var(--color-error)', border: '1px solid var(--color-error)' },
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled || pending}
      style={{
        width: '100%', padding: '14px', borderRadius: 12,
        fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
        cursor: disabled || pending ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        ...styles[variant],
      }}
    >
      {pending && <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />}
      {children}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--color-surface-2)', borderRadius: 12, border: '1px solid var(--color-border)', marginBottom: 16 }}>
      <AlertCircle size={15} color="var(--color-error)" />
      <span style={{ fontSize: 13, color: 'var(--color-error)' }}>{message}</span>
    </div>
  )
}

export default function OrderActions({
  orderId,
  status,
  viewerRole,
  dispute,
}: {
  orderId: string
  status: string
  viewerRole: 'buyer' | 'seller'
  dispute: any
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [showProposeForm, setShowProposeForm] = useState(false)

  function run(fn: () => Promise<{ error?: string | null; success?: boolean }>) {
    setError('')
    startTransition(async () => {
      const result = await fn()
      if (result?.error) setError(result.error)
      else router.refresh()
    })
  }

  // ─── Terminal states ──────────────────────────────────────────────────
  if (status === 'released') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', border: '1px solid var(--color-border)', borderRadius: 14 }}>
        <CheckCircle size={18} color="var(--color-brand)" />
        <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          {viewerRole === 'seller' ? t('wallet.funds_released_seller') : t('wallet.funds_released_buyer')}
        </span>
      </div>
    )
  }
  if (status === 'refunded') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', border: '1px solid var(--color-border)', borderRadius: 14 }}>
        <CheckCircle size={18} color="var(--color-text-muted)" />
        <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          {t('wallet.order_refunded', { suffix: viewerRole === 'buyer' ? t('wallet.order_refunded_to_wallet_suffix') : '' })}
        </span>
      </div>
    )
  }

  // ─── Disputed: full dispute panel ─────────────────────────────────────
  if (status === 'disputed' && dispute) {
    return <DisputePanel orderId={orderId} dispute={dispute} viewerRole={viewerRole} />
  }

  // ─── held / delivered_by_seller: everyday actions ─────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {error && <ErrorBanner message={error} />}

      {viewerRole === 'seller' && status === 'held' && (
        <PrimaryButton pending={isPending} onClick={() => run(() => markDeliveredAction({ orderId }))}>
          {t('wallet.mark_delivered')}
        </PrimaryButton>
      )}

      {viewerRole === 'seller' && status === 'delivered_by_seller' && (
        <div style={{ padding: '14px 16px', border: '1px solid var(--color-border)', borderRadius: 14, fontSize: 14, color: 'var(--color-text-muted)' }}>
          {t('wallet.waiting_buyer_confirm')}
        </div>
      )}

      {viewerRole === 'buyer' && (status === 'held' || status === 'delivered_by_seller') && (
        <PrimaryButton pending={isPending} onClick={() => run(() => confirmReceiptAction({ orderId }))}>
          {t('wallet.confirm_receipt_release')}
        </PrimaryButton>
      )}

      {!showDisputeForm ? (
        <PrimaryButton variant="danger" onClick={() => setShowDisputeForm(true)}>
          {t('wallet.report_problem')}
        </PrimaryButton>
      ) : (
        <OpenDisputeForm orderId={orderId} onCancel={() => setShowDisputeForm(false)} viewerRole={viewerRole} />
      )}
    </div>
  )
}

// ─── Open a new dispute ───────────────────────────────────────────────────

function OpenDisputeForm({ orderId, onCancel, viewerRole }: { orderId: string; onCancel: () => void; viewerRole: 'buyer' | 'seller' }) {
  const { t } = useTranslation()
  const REASON_LABEL = reasonLabel(t)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [reason, setReason] = useState<DisputeReason>(viewerRole === 'buyer' ? 'item_not_received' : 'buyer_falsely_disputing')
  const [details, setDetails] = useState('')
  const [error, setError] = useState('')

  const reasons: DisputeReason[] = viewerRole === 'buyer'
    ? ['item_not_received', 'item_not_as_described', 'seller_unresponsive', 'other']
    : ['buyer_falsely_disputing', 'other']

  function handleSubmit() {
    if (!details.trim()) { setError(t('wallet.describe_what_happened_error')); return }
    setError('')
    startTransition(async () => {
      const result = await openDisputeAction({ orderId, reason, details })
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 12, fontFamily: "'Syne', sans-serif" }}>
        {t('wallet.what_went_wrong')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {reasons.map(r => (
          <button
            key={r}
            onClick={() => setReason(r)}
            style={{
              textAlign: 'left', padding: '10px 12px', borderRadius: 10,
              border: `1px solid ${reason === r ? 'var(--color-brand)' : 'var(--color-border)'}`,
              background: reason === r ? 'var(--color-surface-2)' : 'none',
              color: reason === r ? 'var(--color-brand)' : 'var(--color-text-secondary)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {REASON_LABEL[r]}
          </button>
        ))}
      </div>
      <textarea
        value={details}
        onChange={e => setDetails(e.target.value)}
        placeholder={t('wallet.describe_what_happened_placeholder')}
        rows={3}
        style={{ width: '100%', border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: 'var(--color-text-primary)', background: 'none', outline: 'none', resize: 'none', marginBottom: 14, boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif" }}
      />
      {error && <ErrorBanner message={error} />}
      <div style={{ display: 'flex', gap: 10 }}>
        <PrimaryButton variant="secondary" onClick={onCancel}>{t('common.cancel')}</PrimaryButton>
        <PrimaryButton pending={isPending} onClick={handleSubmit}>{t('wallet.open_dispute')}</PrimaryButton>
      </div>
    </div>
  )
}

// ─── Full dispute panel: evidence, proposals, escalate ────────────────────

function DisputePanel({ orderId, dispute, viewerRole }: { orderId: string; dispute: any; viewerRole: 'buyer' | 'seller' }) {
  const { t } = useTranslation()
  const REASON_LABEL = reasonLabel(t)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [showEvidenceForm, setShowEvidenceForm] = useState(false)
  const [showProposeForm, setShowProposeForm] = useState(false)

  const pendingProposal = (dispute.proposals || []).find((p: any) => p.status === 'pending')
  const isMine = (uploaderOrProposerId: string, myId?: string) => false // resolved server-side; we just show both sides' items

  function run(fn: () => Promise<{ error?: string | null; success?: boolean; accepted?: boolean }>) {
    setError('')
    startTransition(async () => {
      const result = await fn()
      if (result?.error) setError(result.error)
      else router.refresh()
    })
  }

  const resolved = ['resolved_mutual', 'resolved_admin'].includes(dispute.status)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 14, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <AlertCircle size={16} color="var(--color-error)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-error)' }}>
            {REASON_LABEL[dispute.reason as DisputeReason] || dispute.reason}
          </span>
        </div>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{dispute.details}</p>
      </div>

      {resolved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', border: '1px solid var(--color-border)', borderRadius: 14 }}>
          <CheckCircle size={18} color="var(--color-brand)" />
          <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            {dispute.status === 'resolved_admin'
              ? t('wallet.resolved_admin', { detail: `${dispute.resolution?.replace(/_/g, ' ')}${dispute.resolution_notes ? `: ${dispute.resolution_notes}` : ''}` })
              : t('wallet.resolved_agreement', { detail: `${dispute.resolution?.replace(/_/g, ' ')}${dispute.resolution_notes ? `: ${dispute.resolution_notes}` : ''}` })}
          </span>
        </div>
      )}

      {dispute.status === 'escalated' && (
        <div style={{ padding: '14px 16px', border: '1px solid var(--color-border)', borderRadius: 14, fontSize: 14, color: 'var(--color-text-muted)' }}>
          {t('wallet.escalated_notice')}
        </div>
      )}

      {/* Evidence */}
      {(dispute.evidence?.length > 0 || !resolved) && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8, fontFamily: "'Syne', sans-serif" }}>
            {t('wallet.evidence_label')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            {(dispute.evidence || []).map((ev: any) => (
              <div key={ev.id} style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 12px' }}>
                {ev.file_url && ev.evidence_type === 'photo' && (
                  <img src={ev.file_url} alt={t('wallet.evidence_alt')} style={{ width: '100%', borderRadius: 8, marginBottom: ev.text_content ? 8 : 0, display: 'block' }} />
                )}
                {ev.text_content && <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{ev.text_content}</div>}
              </div>
            ))}
            {(!dispute.evidence || dispute.evidence.length === 0) && (
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t('wallet.no_evidence_yet')}</div>
            )}
          </div>
          {!resolved && !showEvidenceForm && (
            <button onClick={() => setShowEvidenceForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--color-brand)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
              <Upload size={14} /> {t('wallet.add_evidence')}
            </button>
          )}
          {showEvidenceForm && <EvidenceForm disputeId={dispute.id} onDone={() => { setShowEvidenceForm(false); router.refresh() }} onCancel={() => setShowEvidenceForm(false)} />}
        </div>
      )}

      {/* Proposals */}
      {!resolved && dispute.status !== 'escalated' && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8, fontFamily: "'Syne', sans-serif" }}>
            {t('wallet.resolve_together')}
          </div>

          {(dispute.proposals || []).filter((p: any) => p.status !== 'withdrawn').map((p: any) => (
            <div key={p.id} style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 600, marginBottom: 2 }}>
                {p.resolution_type === 'release_to_seller' && t('wallet.proposal_release_seller')}
                {p.resolution_type === 'refund_to_buyer' && t('wallet.proposal_refund_buyer')}
                {p.resolution_type === 'split' && t('wallet.proposal_split', { seller: formatNaira(p.split_seller_kobo), buyer: formatNaira(p.split_buyer_kobo) })}
              </div>
              {p.message && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>{p.message}</div>}
              <div style={{ fontSize: 11, fontWeight: 600, color: p.status === 'pending' ? 'var(--color-gold)' : p.status === 'accepted' ? 'var(--color-brand)' : 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: p.status === 'pending' ? 8 : 0 }}>
                {p.status}
              </div>
              {p.status === 'pending' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => run(() => respondToProposalAction({ proposalId: p.id, accept: true }))} disabled={isPending} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: 'var(--color-brand)', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {t('wallet.accept')}
                  </button>
                  <button onClick={() => run(() => respondToProposalAction({ proposalId: p.id, accept: false }))} disabled={isPending} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'none', color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {t('wallet.reject')}
                  </button>
                </div>
              )}
            </div>
          ))}

          {error && <ErrorBanner message={error} />}

          {!showProposeForm && !pendingProposal && (
            <PrimaryButton variant="secondary" onClick={() => setShowProposeForm(true)}>
              {t('wallet.propose_resolution')}
            </PrimaryButton>
          )}
          {showProposeForm && (
            <ProposeForm
              disputeId={dispute.id}
              onDone={() => { setShowProposeForm(false); router.refresh() }}
              onCancel={() => setShowProposeForm(false)}
            />
          )}

          <div style={{ marginTop: 10 }}>
            <PrimaryButton variant="danger" pending={isPending} onClick={() => run(() => escalateDisputeAction({ disputeId: dispute.id }))}>
              {t('wallet.escalate_cta')}
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  )
}

function EvidenceForm({ disputeId, onDone, onCancel }: { disputeId: string; onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const [isPending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [fileUrl, setFileUrl] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'image')
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error || t('wallet.upload_failed_generic')); return }
      setFileUrl(data.media.url)
    } catch {
      setError(t('wallet.upload_failed_retry'))
    } finally {
      setUploading(false)
    }
  }

  function handleSubmit() {
    if (!fileUrl && !note.trim()) { setError(t('wallet.add_photo_or_note_error')); return }
    setError('')
    startTransition(async () => {
      const result = await submitDisputeEvidenceAction({
        disputeId,
        evidenceType: fileUrl ? 'photo' : 'note',
        fileUrl: fileUrl || undefined,
        textContent: note.trim() || undefined,
      })
      if (result.error) setError(result.error)
      else onDone()
    })
  }

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: 12, marginTop: 8 }}>
      {fileUrl ? (
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <img src={fileUrl} alt={t('wallet.evidence_preview_alt')} style={{ width: '100%', borderRadius: 8, display: 'block' }} />
          <button onClick={() => setFileUrl('')} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={14} color="white" />
          </button>
        </div>
      ) : (
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px', border: '1px dashed var(--color-border)', borderRadius: 10, cursor: 'pointer', marginBottom: 10, fontSize: 13, color: 'var(--color-text-muted)' }}>
          {uploading ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Upload size={14} />}
          {uploading ? t('wallet.uploading') : t('wallet.upload_a_photo_hint')}
          <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} disabled={uploading} />
        </label>
      )}
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder={t('wallet.tracking_note_placeholder')}
        rows={2}
        style={{ width: '100%', border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--color-text-primary)', background: 'none', outline: 'none', resize: 'none', marginBottom: 10, boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif" }}
      />
      {error && <ErrorBanner message={error} />}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'none', color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{t('common.cancel')}</button>
        <button onClick={handleSubmit} disabled={isPending || uploading} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--color-brand)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {isPending ? t('wallet.submitting') : t('wallet.submit_evidence')}
        </button>
      </div>
    </div>
  )
}

function ProposeForm({ disputeId, onDone, onCancel }: { disputeId: string; onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const [isPending, startTransition] = useTransition()
  const [type, setType] = useState<'release_to_seller' | 'refund_to_buyer' | 'split'>('release_to_seller')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function handleSubmit() {
    setError('')
    startTransition(async () => {
      const result = await proposeResolutionAction({ disputeId, resolutionType: type, message: message.trim() || undefined })
      if (result.error) setError(result.error)
      else onDone()
    })
  }

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: 12, marginTop: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {[
          { v: 'release_to_seller', label: t('wallet.propose_release_full') },
          { v: 'refund_to_buyer', label: t('wallet.propose_refund_full') },
        ].map(opt => (
          <button
            key={opt.v}
            onClick={() => setType(opt.v as any)}
            style={{
              textAlign: 'left', padding: '10px 12px', borderRadius: 8,
              border: `1px solid ${type === opt.v ? 'var(--color-brand)' : 'var(--color-border)'}`,
              background: type === opt.v ? 'var(--color-surface-2)' : 'none',
              color: type === opt.v ? 'var(--color-brand)' : 'var(--color-text-secondary)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 10 }}>
        {t('wallet.split_hint')}
      </p>
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder={t('wallet.offer_note_placeholder')}
        rows={2}
        style={{ width: '100%', border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--color-text-primary)', background: 'none', outline: 'none', resize: 'none', marginBottom: 10, boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif" }}
      />
      {error && <ErrorBanner message={error} />}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'none', color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{t('common.cancel')}</button>
        <button onClick={handleSubmit} disabled={isPending} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--color-brand)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {isPending ? t('wallet.sending') : t('wallet.send_proposal')}
        </button>
      </div>
    </div>
  )
}