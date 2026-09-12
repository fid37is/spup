// src/app/(admin)/promotions/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatNaira, formatNumber, formatRelativeTime } from '@/lib/utils'
import { Megaphone, TrendingUp, Eye } from 'lucide-react'
import Link from 'next/link'
import { StatCard } from '@/components/admin/stat-card'
import { StatusBadge } from '@/components/admin/status-badge'
import { DataTable, type Column } from '@/components/admin/data-table'
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
        <Link href={`/promotions/${r.id}`} className="block no-underline">
          <div className="mb-0.5 max-w-[320px] truncate text-[13px] text-primary">
            {r.post?.body || '(no text)'}
          </div>
          <div className="text-xs text-faint">@{r.user?.username || 'unknown'}</div>
        </Link>
      ),
    },
    { key: 'tier', header: 'Tier', mobileHidden: true, render: r => <span className="text-[13px] capitalize text-secondary">{r.tier}</span> },
    { key: 'price', header: 'Price', align: 'right', render: r => <span className="font-display text-[13px] font-bold text-brand">{formatNaira(r.price_kobo)}</span> },
    { key: 'impressions', header: 'Impressions', align: 'right', mobileHidden: true, render: r => <span className="text-[13px] text-[#D0D0C8]">{formatNumber(r.impressions_count)}</span> },
    { key: 'clicks', header: 'Clicks', align: 'right', render: r => <span className="text-[13px] text-[#D0D0C8]">{formatNumber(r.clicks_count)}</span> },
    { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
    { key: 'ends', header: 'Ends', mobileHidden: true, render: r => <span className="text-xs text-faint">{r.ends_at ? formatRelativeTime(r.ends_at) : '—'}</span> },
    {
      key: 'actions', header: '', align: 'right',
      render: r => r.status === 'active' ? <PromotionActions promotionId={r.id} /> : null,
    },
  ]

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Promotions</h1>
        <p className="mt-0.5 text-sm text-faint">Users paying to boost their own posts</p>
      </div>

      <div className="mb-7 grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3.5">
        <StatCard icon={Megaphone} label="Currently active" value={formatNumber(summary.activeCount)} />
        <StatCard icon={TrendingUp} label="Revenue this month" value={formatNaira(summary.revenueThisMonth)} color="#1A9E5F" />
        <StatCard icon={Eye} label="Total impressions served" value={formatNumber(summary.totalImpressions)} color="#378ADD" />
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
              <span className="rounded-lg bg-[color:var(--color-surface-3)] px-1.5 py-0.5 text-[10px] font-extrabold text-secondary">
                {counts[tab.key]}
              </span>
            )}
          </Link>
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
