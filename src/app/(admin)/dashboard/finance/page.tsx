// src/app/(admin)/finance/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatNaira, formatRelativeTime } from '@/lib/utils'
import { Wallet, TrendingUp, ArrowDownCircle, Megaphone } from 'lucide-react'
import Link from 'next/link'
import { StatCard } from '@/components/admin/stat-card'
import { StatusBadge } from '@/components/admin/status-badge'
import { DataTable, Column } from '@/components/admin/data-table'
import { AdminPagination } from '@/components/admin/pagination'

interface SearchParams { type?: string; page?: string }

interface TxnRow {
  id: string
  type: string
  amount_kobo: number
  platform_fee_kobo: number
  status: string
  reference: string | null
  description: string | null
  created_at: string
  wallet: { user: { username: string; display_name: string } | null } | null
}

const TYPE_TABS = [
  { key: 'all',                    label: 'All' },
  { key: 'earning_ad',             label: 'Ad earnings' },
  { key: 'earning_tip',            label: 'Tips' },
  { key: 'earning_subscription',   label: 'Subscriptions' },
  { key: 'promotion_spend',        label: 'Promotion spend' },
  { key: 'withdrawal',             label: 'Withdrawals' },
  { key: 'refund',                 label: 'Refunds' },
]

const PAGE_SIZE = 40

async function getTransactions(params: SearchParams) {
  const admin = createAdminClient()
  const page = parseInt(params.page || '1')
  const from = (page - 1) * PAGE_SIZE

  let query = admin
    .from('transactions')
    .select(`
      id, type, amount_kobo, platform_fee_kobo, status, reference, description, created_at,
      wallet:wallets(user:users(username, display_name))
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)

  if (params.type && params.type !== 'all') query = query.eq('type', params.type)

  const { data, count } = await query
  return { rows: (data || []) as unknown as TxnRow[], total: count || 0, page }
}

async function getSummary() {
  const admin = createAdminClient()
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [{ data: monthTxns }, { count: pendingWithdrawals }, { data: walletTotals }] = await Promise.all([
    admin.from('transactions').select('type, amount_kobo, platform_fee_kobo').eq('status', 'completed').gte('created_at', startOfMonth),
    admin.from('transactions').select('id', { count: 'exact', head: true }).eq('type', 'withdrawal').eq('status', 'pending'),
    admin.from('wallets').select('balance_kobo'),
  ])

  const platformRevenue = (monthTxns || [])
    .filter((t: { type: string }) => t.type.startsWith('earning'))
    .reduce((sum: number, t: { platform_fee_kobo: number; amount_kobo: number }) => sum + (t.platform_fee_kobo || Math.round(t.amount_kobo * 0.3)), 0)

  const promotionRevenue = (monthTxns || [])
    .filter((t: { type: string }) => t.type === 'promotion_spend')
    .reduce((sum: number, t: { amount_kobo: number }) => sum + t.amount_kobo, 0)

  const totalWalletBalance = (walletTotals || []).reduce((sum: number, w: { balance_kobo: number }) => sum + w.balance_kobo, 0)

  return {
    platformRevenue: platformRevenue + promotionRevenue,
    promotionRevenue,
    pendingWithdrawals: pendingWithdrawals || 0,
    totalWalletBalance,
  }
}

export default async function AdminFinancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const activeType = params.type || 'all'
  const [{ rows, total, page }, summary] = await Promise.all([getTransactions(params), getSummary()])
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const columns: Column<TxnRow>[] = [
    {
      key: 'user', header: 'User',
      render: r => (
        <Link href={`/finance/${r.id}`} style={{ fontSize: 13, color: '#F0F0EC', textDecoration: 'none' }}>
          @{r.wallet?.user?.username || 'unknown'}
        </Link>
      ),
    },
    {
      key: 'type', header: 'Type',
      render: r => <span style={{ fontSize: 13, color: '#8A8A85' }}>{r.type.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'amount', header: 'Amount', align: 'right',
      render: r => (
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Syne', sans-serif", color: r.type === 'withdrawal' ? '#E53935' : '#1A9E5F' }}>
          {r.type === 'withdrawal' ? '-' : '+'}{formatNaira(r.amount_kobo)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
    {
      key: 'reference', header: 'Reference',
      render: r => <span style={{ fontSize: 12, color: '#44444A', fontFamily: 'monospace' }}>{r.reference || '—'}</span>,
    },
    { key: 'date', header: 'Date', render: r => <span style={{ fontSize: 12, color: '#44444A' }}>{formatRelativeTime(r.created_at)}</span> },
  ]

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em' }}>Finance</h1>
        <p style={{ fontSize: 14, color: '#44444A', marginTop: 2 }}>Platform revenue, wallets, and the full transactions ledger</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
        <StatCard icon={TrendingUp} label="Platform revenue (month)" value={formatNaira(summary.platformRevenue)} color="#1A9E5F" />
        <StatCard icon={Megaphone} label="Promotion revenue (month)" value={formatNaira(summary.promotionRevenue)} color="#378ADD" />
        <StatCard icon={Wallet} label="Total held in creator wallets" value={formatNaira(summary.totalWalletBalance)} color="#D4A017" />
        <StatCard icon={ArrowDownCircle} label="Pending withdrawals" value={String(summary.pendingWithdrawals)} danger={summary.pendingWithdrawals > 0} />
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #1E1E26', overflowX: 'auto' }}>
        {TYPE_TABS.map(tab => (
          <a
            key={tab.key}
            href={`?type=${tab.key}`}
            style={{
              padding: '10px 16px', textDecoration: 'none', fontSize: 13, whiteSpace: 'nowrap',
              fontFamily: "'Syne', sans-serif", fontWeight: 600,
              color: activeType === tab.key ? '#F0F0EC' : '#44444A',
              borderBottom: activeType === tab.key ? '2px solid #1A9E5F' : '2px solid transparent',
            }}
          >
            {tab.label}
          </a>
        ))}
      </div>

      <DataTable columns={columns} rows={rows} keyField="id" emptyMessage="No transactions found" />
      <AdminPagination page={page} totalPages={totalPages} basePath="/finance" extraParams={activeType !== 'all' ? `type=${activeType}` : ''} />
    </div>
  )
}