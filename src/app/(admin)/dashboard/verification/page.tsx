// src/app/(admin)/admin/verification/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatRelativeTime } from '@/lib/utils'
import { BadgeCheck, Clock } from 'lucide-react'
import { StatCard } from '@/components/admin/stat-card'
import { StatusBadge } from '@/components/admin/status-badge'
import { DataTable, Column } from '@/components/admin/data-table'
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
      render: r => (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#F0F0EC' }}>{r.user?.display_name}</div>
          <div style={{ fontSize: 12, color: '#44444A' }}>@{r.user?.username}</div>
        </div>
      ),
    },
    {
      key: 'current', header: 'Current tier',
      render: r => <span style={{ fontSize: 13, color: '#8A8A85', textTransform: 'capitalize' }}>{r.user?.verification_tier || 'none'}</span>,
    },
    {
      key: 'requested', header: 'Requesting',
      render: r => <span style={{ fontSize: 13, fontWeight: 700, color: '#378ADD', textTransform: 'capitalize' }}>{r.requested_tier}</span>,
    },
    {
      key: 'note', header: 'Note', width: '26%',
      render: r => <span style={{ fontSize: 13, color: '#8A8A85' }}>{r.note || '-'}</span>,
    },
    { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
    { key: 'date', header: 'Submitted', render: r => <span style={{ fontSize: 12, color: '#44444A' }}>{formatRelativeTime(r.created_at)}</span> },
    {
      key: 'actions', header: '', align: 'right',
      render: r => r.status === 'pending' ? <VerificationActions requestId={r.id} /> : null,
    },
  ]

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em' }}>Verification</h1>
        <p style={{ fontSize: 14, color: '#44444A', marginTop: 2 }}>Review requests for standard, creator, and organisation status</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
        <StatCard icon={Clock} label="Awaiting review" value={String(counts.pending)} color="#D4A017" danger={counts.pending > 0} />
        <StatCard icon={BadgeCheck} label="Approved" value={String(counts.approved)} color="#1A9E5F" />
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #1E1E26' }}>
        {TABS.map(tab => (
          <a
            key={tab.key}
            href={`?status=${tab.key}`}
            style={{
              padding: '10px 16px', textDecoration: 'none', fontSize: 13,
              fontFamily: "'Syne', sans-serif", fontWeight: 600,
              color: activeStatus === tab.key ? '#F0F0EC' : '#44444A',
              borderBottom: activeStatus === tab.key ? '2px solid #1A9E5F' : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span style={{
                background: tab.key === 'pending' && counts[tab.key] > 0 ? '#D4A017' : '#1E1E26',
                color: tab.key === 'pending' && counts[tab.key] > 0 ? '#000' : '#6A6A60',
                fontSize: 10, fontWeight: 800, borderRadius: 8, padding: '1px 6px',
              }}>
                {counts[tab.key]}
              </span>
            )}
          </a>
        ))}
      </div>

      <DataTable columns={columns} rows={requests} keyField="id" emptyMessage={`No ${activeStatus} verification requests`} />
    </div>
  )
}