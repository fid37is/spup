// src/app/(admin)/promotions/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatNaira, formatNumber, formatRelativeTime } from '@/lib/utils'
import { Megaphone, TrendingUp, Wallet, Eye } from 'lucide-react'
import Link from 'next/link'
import { StatCard } from '@/components/admin/stat-card'
import { StatusBadge } from '@/components/admin/status-badge'
import { DataTable, Column } from '@/components/admin/data-table'
import PromotionActions from './promotion-actions'

interface SearchParams { status?: string }

interface PromotionRow {
  id: string
  tier: string
  price_kobo: number
  duration_hours: number
  status: string
  impressions_count: number
  clicks_count: number
  starts_at: string | null
  ends_at: string | null
  created_at: string
  post: { id: string; body: string | null } | null
  user: { username: string; display_name: string } | null
}

async function getPromotions(params: SearchParams) {
  const admin = createAdminClient()
  const status = params.status || 'active'

  const { data } = await admin
    .from('post_promotions')
    .select(`
      id, tier, price_kobo, duration_hours, status, impressions_count, clicks_count,
      starts_at, ends_at, created_at,
      post:posts(id, body),
      user:users(username, display_name)
    `)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(50)

  return (data || []) as unknown as PromotionRow[]
}

async function getCounts() {
  const admin = createAdminClient()
  const statuses = ['pending', 'active', 'completed', 'failed', 'cancelled']
  const counts: Record<string, number> = {}
  await Promise.all(statuses.map(async s => {
    const { count } = await admin.from('post_promotions').select('id', { count: 'exact', head: true }).eq('status', s)
    counts[s] = count || 0
  }))
  return counts
}

async function getSummary() {
  const admin = createAdminClient()
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [{ count: activeCount }, { data: monthRevenue }, { data: allImpressions }] = await Promise.all([
    admin.from('post_promotions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('post_promotions').select('price_kobo').in('status', ['active', 'completed']).gte('created_at', startOfMonth),
    admin.from('post_promotions').select('impressions_count').in('status', ['active', 'completed']),
  ])

  const revenueThisMonth = (monthRevenue || []).reduce((sum: number, r: { price_kobo: number }) => sum + r.price_kobo, 0)
  const totalImpressions = (allImpressions || []).reduce((sum: number, r: { impressions_count: number }) => sum + r.impressions_count, 0)

  return { activeCount: activeCount || 0, revenueThisMonth, totalImpressions }
}

const TABS = [
  { key: 'active',    label: 'Active' },
  { key: 'pending',   label: 'Pending payment' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed',    label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
]

export default async function AdminPromotionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const activeStatus = params.status || 'active'
  const [promotions, counts, summary] = await Promise.all([getPromotions(params), getCounts(), getSummary()])

  const columns: Column<PromotionRow>[] = [
    {
      key: 'post', header: 'Post', width: '32%',
      render: r => (
        <Link href={`/promotions/${r.id}`} style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: 13, color: '#F0F0EC', marginBottom: 2, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.post?.body || '(no text)'}
          </div>
          <div style={{ fontSize: 12, color: '#44444A' }}>
            @{r.user?.username || 'unknown'}
          </div>
        </Link>
      ),
    },
    { key: 'tier', header: 'Tier', render: r => <span style={{ fontSize: 13, color: '#8A8A85', textTransform: 'capitalize' }}>{r.tier}</span> },
    { key: 'price', header: 'Price', align: 'right', render: r => <span style={{ fontSize: 13, fontWeight: 700, color: '#1A9E5F', fontFamily: "'Syne', sans-serif" }}>{formatNaira(r.price_kobo)}</span> },
    { key: 'impressions', header: 'Impressions', align: 'right', render: r => <span style={{ fontSize: 13, color: '#D0D0C8' }}>{formatNumber(r.impressions_count)}</span> },
    { key: 'clicks', header: 'Clicks', align: 'right', render: r => <span style={{ fontSize: 13, color: '#D0D0C8' }}>{formatNumber(r.clicks_count)}</span> },
    { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
    { key: 'ends', header: 'Ends', render: r => <span style={{ fontSize: 12, color: '#44444A' }}>{r.ends_at ? formatRelativeTime(r.ends_at) : '—'}</span> },
    {
      key: 'actions', header: '', align: 'right',
      render: r => r.status === 'active' ? <PromotionActions promotionId={r.id} /> : null,
    },
  ]

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em' }}>Promotions</h1>
        <p style={{ fontSize: 14, color: '#44444A', marginTop: 2 }}>Users paying to boost their own posts</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
        <StatCard icon={Megaphone} label="Currently active" value={formatNumber(summary.activeCount)} />
        <StatCard icon={TrendingUp} label="Revenue this month" value={formatNaira(summary.revenueThisMonth)} color="#1A9E5F" />
        <StatCard icon={Eye} label="Total impressions served" value={formatNumber(summary.totalImpressions)} color="#378ADD" />
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
              <span style={{ background: '#1E1E26', color: '#6A6A60', fontSize: 10, fontWeight: 800, borderRadius: 8, padding: '1px 6px' }}>
                {counts[tab.key]}
              </span>
            )}
          </a>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={promotions}
        keyField="id"
        emptyMessage={`No ${activeStatus.replace('_', ' ')} promotions`}
      />
    </div>
  )
}