// src/app/(admin)/disputes/[id]/page.tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDisputeAdmin } from '@/lib/queries/escrow'
import { formatNaira, formatRelativeTime } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'
import { StatusBadge } from '@/components/admin/status-badge'
import DisputeResolutionForm from './dispute-resolution-form'

const REASON_LABEL: Record<string, string> = {
  item_not_received: 'Item not received',
  item_not_as_described: 'Item not as described',
  seller_unresponsive: 'Seller unresponsive',
  buyer_falsely_disputing: 'Buyer falsely disputing',
  other: 'Other',
}

const RESOLUTION_LABEL: Record<string, string> = {
  release_to_seller: 'Release to seller',
  refund_to_buyer: 'Refund to buyer',
  split: 'Split',
}

const PROPOSAL_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:   { bg: 'rgba(212,160,23,0.12)',  color: '#D4A017' },
  accepted:  { bg: 'rgba(26,158,95,0.12)',   color: '#1A9E5F' },
  rejected:  { bg: 'rgba(229,57,53,0.12)',   color: '#E53935' },
  withdrawn: { bg: 'rgba(100,100,100,0.12)', color: '#8A8A85' },
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="mb-3.5 text-[11px] font-bold tracking-wide text-faint">{title}</div>
      {children}
    </div>
  )
}

export default async function AdminDisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { dispute, error } = await getDisputeAdmin(id)
  if (error || !dispute) notFound()

  const order = dispute.order as any
  const evidence = (dispute.evidence || []) as any[]
  const proposals = (dispute.proposals || []) as any[]
  const opener = dispute.opener as any
  const resolver = dispute.resolver as any

  const isResolved = ['resolved_mutual', 'resolved_admin'].includes(dispute.status)
  const canResolve = dispute.status === 'escalated'

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <Link href="/disputes" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-faint no-underline">
        <ArrowLeft size={14} /> Back to disputes
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">
            {REASON_LABEL[dispute.reason] || dispute.reason}
          </h1>
          <p className="mt-0.5 text-[13px] text-faint">
            Opened by <span className="font-semibold text-secondary">@{opener?.username || 'unknown'}</span> · {formatRelativeTime(dispute.created_at)}
          </p>
        </div>
        <StatusBadge status={dispute.status} />
      </div>

      {/* Order summary */}
      <div className="mb-4 rounded-2xl border border-border bg-surface p-4 sm:mb-5 sm:p-5">
        <div className="mb-3.5 text-[11px] font-bold tracking-wide text-faint">ORDER</div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <Link href={`/users/${order?.buyer?.id}`} className="font-semibold text-primary no-underline">
              @{order?.buyer?.username || 'unknown'}
            </Link>
            <span className="text-faint">buyer →</span>
            <Link href={`/users/${order?.seller?.id}`} className="font-semibold text-primary no-underline">
              @{order?.seller?.username || 'unknown'}
            </Link>
            <span className="text-faint">seller</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-display text-lg font-extrabold text-brand">{order ? formatNaira(order.amount_kobo) : '—'}</span>
            {order && <StatusBadge status={order.status} />}
          </div>
        </div>
        {order?.note && (
          <p className="mt-3 rounded-lg bg-[color:var(--color-surface-2)] px-3.5 py-2.5 text-[13px] italic text-secondary">
            &ldquo;{order.note}&rdquo;
          </p>
        )}
        {order?.post?.content && (
          <p className="mt-2 line-clamp-2 text-xs text-faint">Re: {order.post.content}</p>
        )}
      </div>

      {/* Dispute details */}
      <Panel title="DISPUTE DETAILS">
        <p className="text-[13px] leading-relaxed text-[#D0D0C8]">{dispute.details}</p>
        {dispute.response_deadline_at && !isResolved && (
          <p className="mt-2.5 text-xs text-faint">Response deadline: {formatRelativeTime(dispute.response_deadline_at)}</p>
        )}
      </Panel>

      {/* Evidence */}
      <div className="mt-4 sm:mt-5">
        <Panel title={`EVIDENCE (${evidence.length})`}>
          {evidence.length === 0 ? (
            <p className="text-[13px] text-faint">No evidence submitted</p>
          ) : (
            <div className="flex flex-col gap-3">
              {evidence.map((e: any) => (
                <div key={e.id} className="border-b border-[#141418] pb-3 last:border-b-0 last:pb-0">
                  <div className="mb-1.5 flex items-center gap-2 text-xs text-faint">
                    <span className="font-semibold text-secondary">@{e.uploader?.username || 'unknown'}</span>
                    <span>·</span>
                    <span className="capitalize">{e.evidence_type.replace('_', ' ')}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(e.created_at)}</span>
                  </div>
                  {e.evidence_type === 'photo' && e.file_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.file_url} alt="Evidence" className="max-h-64 rounded-lg border border-border object-contain" />
                  )}
                  {e.evidence_type === 'video' && e.file_url && (
                    <video src={e.file_url} controls className="max-h-64 rounded-lg border border-border" />
                  )}
                  {(e.evidence_type === 'tracking_number' || e.evidence_type === 'note') && (
                    <p className="text-[13px] text-[#D0D0C8]">{e.text_content}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Proposal history */}
      <div className="mt-4 sm:mt-5">
        <Panel title={`PROPOSAL HISTORY (${proposals.length})`}>
          {proposals.length === 0 ? (
            <p className="text-[13px] text-faint">No proposals were made</p>
          ) : (
            <div className="flex flex-col gap-3">
              {[...proposals].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map((p: any) => {
                const style = PROPOSAL_STATUS_STYLE[p.status] || PROPOSAL_STATUS_STYLE.pending
                return (
                  <div key={p.id} className="border-b border-[#141418] pb-3 last:border-b-0 last:pb-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-primary">@{p.proposer?.username || 'unknown'}</span>
                      <span className="text-xs text-faint">proposed</span>
                      <span className="font-display text-[13px] font-bold text-[#378ADD]">{RESOLUTION_LABEL[p.resolution_type] || p.resolution_type}</span>
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: style.bg, color: style.color }}>
                        {p.status.toUpperCase()}
                      </span>
                    </div>
                    {p.resolution_type === 'split' && (
                      <p className="text-xs text-faint">
                        Seller: {formatNaira(p.split_seller_kobo)} · Buyer: {formatNaira(p.split_buyer_kobo)}
                      </p>
                    )}
                    {p.message && <p className="mt-1 text-[13px] text-secondary">&ldquo;{p.message}&rdquo;</p>}
                    <p className="mt-1 text-xs text-faint">{formatRelativeTime(p.created_at)}</p>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Resolution */}
      <div className="mt-4 sm:mt-5">
        {isResolved ? (
          <Panel title="RESOLUTION">
            <p className="text-[13px] text-[#D0D0C8]">
              {RESOLUTION_LABEL[dispute.resolution] || dispute.resolution}
              {dispute.status === 'resolved_admin' && resolver && (
                <> — decided by <span className="font-semibold text-primary">{resolver.display_name}</span></>
              )}
              {dispute.resolved_at && ` · ${formatRelativeTime(dispute.resolved_at)}`}
            </p>
            {dispute.resolution === 'split' && (
              <p className="mt-1.5 text-xs text-faint">
                Seller: {formatNaira(dispute.split_seller_kobo)} · Buyer: {formatNaira(dispute.split_buyer_kobo)}
              </p>
            )}
            {dispute.resolution_notes && (
              <p className="mt-2.5 rounded-lg bg-[color:var(--color-surface-2)] px-3.5 py-2.5 text-[13px] text-secondary">
                {dispute.resolution_notes}
              </p>
            )}
          </Panel>
        ) : canResolve ? (
          <DisputeResolutionForm disputeId={dispute.id} amountKobo={order?.amount_kobo || 0} />
        ) : (
          <div className="rounded-2xl border border-border bg-surface px-5 py-8 text-center">
            <p className="text-[13px] text-faint">
              This dispute is still {dispute.status.replace('_', ' ')} between the two parties — it'll show up here to resolve once escalated.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
