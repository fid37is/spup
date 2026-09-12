// src/app/(admin)/verification/page.tsx
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { formatRelativeTime } from '@/lib/utils'
import { BadgeCheck, Clock } from 'lucide-react'
import { StatCard } from '@/components/admin/stat-card'
import { StatusBadge } from '@/components/admin/status-badge'
import { DataTable, type Column } from '@/components/admin/data-table'
import VerificationActions from './verification-actions'

interface SearchParams { status?: string }

interface RequestRow {
  id: string
  requested_tier: string
  note: string | null
  status: string
  review_notes: string | null
  created_at: string
  reviewed_at: string | null
  user: { id: string; username: string; display_name: string; verification_tier: string } | null
}

const TABS = [
  { key: 'pending',  label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

async function getRequests(status: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('verification_requests')
    .select(`
      id, requested_tier, note, status, review_notes, created_at, reviewed_at,
      user:users(id, username, display_name, verification_tier)
    `)
    .eq('status', status)
    .order('created_at', { ascending: status === 'pending' })
    .limit(50)

  return (data || []) as unknown as RequestRow[]
}

async function getCounts() {
  const admin = createAdminClient()
  const statuses = ['pending', 'approved', 'rejected']
  const counts: Record<string, number> = {}
  await Promise.all(statuses.map(async s => {
    const { count } = await admin.from('verification_requests').select('id', { count: 'exact', head: true }).eq('status', s)
    counts[s] = count || 0
  }))
  return counts
}

export default async function AdminVerificationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const activeStatus = params.status || 'pending'
  const [requests, counts] = await Promise.all([getRequests(activeStatus), getCounts()])

  const columns: Column<RequestRow>[] = [
    {
      key: 'user', header: 'User', width: '26%',
      // This links to the request detail page below — previously nothing
      // in the admin UI linked there at all, even though it exists and
      // shows useful account context (followers, bio, submitted note) for
      // making the review decision.
      render: r => (
        <Link href={`/verification/${r.id}`} className="block no-underline">
          <div className="font-display text-[13px] font-semibold text-primary">{r.user?.display_name}</div>
          <div className="text-xs text-faint">@{r.user?.username}</div>
        </Link>
      ),
    },
    {
      key: 'current', header: 'Current tier', mobileHidden: true,
      render: r => <span className="text-[13px] capitalize text-secondary">{r.user?.verification_tier || 'none'}</span>,
    },
    {
      key: 'requested', header: 'Requesting',
      render: r => <span className="text-[13px] font-bold capitalize text-[#378ADD]">{r.requested_tier}</span>,
    },
    {
      key: 'note', header: 'Note', width: '26%', mobileHidden: true,
      render: r => <span className="max-w-[220px] truncate text-[13px] text-secondary">{r.note || '-'}</span>,
    },
    { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
    { key: 'date', header: 'Submitted', mobileHidden: true, render: r => <span className="text-xs text-faint">{formatRelativeTime(r.created_at)}</span> },
    {
      key: 'actions', header: '', align: 'right',
      render: r => r.status === 'pending' ? <VerificationActions requestId={r.id} /> : null,
    },
  ]

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Verification</h1>
        <p className="mt-0.5 text-sm text-faint">Review requests for standard, creator, and organisation status</p>
      </div>

      <div className="mb-7 grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3.5">
        <StatCard icon={Clock} label="Awaiting review" value={String(counts.pending)} color="#D4A017" danger={counts.pending > 0} />
        <StatCard icon={BadgeCheck} label="Approved" value={String(counts.approved)} color="#1A9E5F" />
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
                className="rounded-lg px-1.5 py-0.5 text-[10px] font-extrabold"
                style={{
                  background: tab.key === 'pending' ? 'var(--color-gold)' : 'var(--color-surface-3)',
                  color: tab.key === 'pending' ? '#000' : 'var(--color-text-secondary)',
                }}
              >
                {counts[tab.key]}
              </span>
            )}
          </Link>
        ))}
      </div>

      <DataTable columns={columns} rows={requests} keyField="id" emptyMessage={`No ${activeStatus} verification requests`} />
    </div>
  )
}
