// src/app/(admin)/disputes/page.tsx
import Link from 'next/link'
import { getDisputesAdmin, getDisputeCountsAdmin } from '@/lib/queries/escrow'
import { formatNaira, formatRelativeTime } from '@/lib/utils'
import { Scale, AlertTriangle } from 'lucide-react'
import { StatCard } from '@/components/admin/stat-card'
import { StatusBadge } from '@/components/admin/status-badge'
import { DataTable, type Column } from '@/components/admin/data-table'

interface SearchParams { status?: string }

type DisputeStatus = 'escalated' | 'open' | 'negotiating' | 'resolved_mutual' | 'resolved_admin'

const REASON_LABEL: Record<string, string> = {
  item_not_received: 'Item not received',
  item_not_as_described: 'Item not as described',
  seller_unresponsive: 'Seller unresponsive',
  buyer_falsely_disputing: 'Buyer falsely disputing',
  other: 'Other',
}

const TABS: { key: DisputeStatus; label: string }[] = [
  { key: 'escalated',       label: 'Escalated' },
  { key: 'open',            label: 'Open' },
  { key: 'negotiating',     label: 'Negotiating' },
  { key: 'resolved_mutual', label: 'Resolved (mutual)' },
  { key: 'resolved_admin',  label: 'Resolved (admin)' },
]

interface DisputeRow {
  id: string
  reason: string
  status: string
  created_at: string
  response_deadline_at: string | null
  evidence: unknown[]
  proposals: unknown[]
  order: {
    amount_kobo: number
    buyer: { username: string } | null
    seller: { username: string } | null
  } | null
}

export default async function AdminDisputesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const activeStatus = (params.status as DisputeStatus) || 'escalated'

  const [{ disputes, error }, counts] = await Promise.all([
    getDisputesAdmin(activeStatus),
    getDisputeCountsAdmin(),
  ])

  const columns: Column<DisputeRow>[] = [
    {
      key: 'parties', header: 'Order', width: '26%',
      render: d => (
        <Link href={`/disputes/${d.id}`} className="block no-underline">
          <div className="text-[13px] text-primary">
            @{d.order?.buyer?.username || 'unknown'} → @{d.order?.seller?.username || 'unknown'}
          </div>
          <div className="mt-0.5 font-display text-[13px] font-bold text-brand">
            {d.order ? formatNaira(d.order.amount_kobo) : '—'}
          </div>
        </Link>
      ),
    },
    {
      key: 'reason', header: 'Reason',
      render: d => <span className="text-[13px] text-secondary">{REASON_LABEL[d.reason] || d.reason}</span>,
    },
    {
      key: 'evidence', header: 'Evidence / offers', align: 'center', mobileHidden: true,
      render: d => <span className="text-[13px] text-faint">{d.evidence?.length || 0} / {d.proposals?.length || 0}</span>,
    },
    { key: 'status', header: 'Status', render: d => <StatusBadge status={d.status} /> },
    {
      key: 'opened', header: 'Opened', mobileHidden: true,
      render: d => <span className="text-xs text-faint">{formatRelativeTime(d.created_at)}</span>,
    },
    {
      key: 'actions', header: '', align: 'right',
      render: d => (
        <Link
          href={`/disputes/${d.id}`}
          className="rounded-lg bg-[color:var(--color-surface-3)] px-3 py-1.5 text-xs font-semibold text-primary no-underline"
        >
          {d.status === 'escalated' ? 'Review' : 'View'}
        </Link>
      ),
    },
  ]

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Disputes</h1>
        <p className="mt-0.5 text-sm text-faint">Escrow disputes buyers and sellers couldn't resolve between themselves</p>
      </div>

      <div className="mb-7 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3.5">
        <StatCard
          icon={AlertTriangle}
          label="Needs your review"
          value={String(counts.escalated)}
          color="#E53935"
          danger={counts.escalated > 0}
        />
        <StatCard icon={Scale} label="Open" value={String(counts.open)} color="#D4A017" />
        <StatCard icon={Scale} label="Negotiating" value={String(counts.negotiating)} color="#378ADD" />
        <StatCard icon={Scale} label="Resolved" value={String(counts.resolved_mutual + counts.resolved_admin)} color="#1A9E5F" />
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map(tab => (
          <Link
            key={tab.key}
            href={`?status=${tab.key}`}
            className="flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 font-display text-[13px] font-semibold no-underline sm:px-4"
            style={{
              color: activeStatus === tab.key ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
              borderBottomColor: activeStatus === tab.key ? 'var(--color-brand)' : 'transparent',
            }}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[11px] font-extrabold"
                style={{
                  background: tab.key === 'escalated' ? 'var(--color-error)' : 'var(--color-surface-3)',
                  color: tab.key === 'escalated' ? 'white' : 'var(--color-text-secondary)',
                }}
              >
                {counts[tab.key]}
              </span>
            )}
          </Link>
        ))}
      </div>

      {error ? (
        <div className="rounded-2xl border border-error/20 bg-surface px-5 py-12 text-center">
          <p className="text-sm text-error">{error}</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={(disputes || []) as unknown as DisputeRow[]}
          keyField="id"
          emptyMessage={`No ${activeStatus.replace('_', ' ')} disputes`}
        />
      )}
    </div>
  )
}
