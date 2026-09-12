// src/app/(admin)/finance/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatNaira, formatRelativeTime } from '@/lib/utils'
import { Wallet, TrendingUp, ArrowDownCircle, Megaphone } from 'lucide-react'
import Link from 'next/link'
import { StatCard } from '@/components/admin/stat-card'
import { StatusBadge } from '@/components/admin/status-badge'
import { DataTable, type Column } from '@/components/admin/data-table'
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
        <Link href={`/finance/${r.id}`} className="text-[13px] text-primary no-underline">
          @{r.wallet?.user?.username || 'unknown'}
        </Link>
      ),
    },
    {
      key: 'type', header: 'Type', mobileHidden: true,
      render: r => <span className="text-[13px] text-secondary">{r.type.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'amount', header: 'Amount', align: 'right',
      render: r => (
        <span className="font-display text-[13px] font-bold" style={{ color: r.type === 'withdrawal' ? 'var(--color-error)' : 'var(--color-brand)' }}>
          {r.type === 'withdrawal' ? '-' : '+'}{formatNaira(r.amount_kobo)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
    {
      key: 'reference', header: 'Reference', mobileHidden: true,
      render: r => <span className="font-mono text-xs text-faint">{r.reference || '—'}</span>,
    },
    { key: 'date', header: 'Date', mobileHidden: true, render: r => <span className="text-xs text-faint">{formatRelativeTime(r.created_at)}</span> },
  ]

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Finance</h1>
        <p className="mt-0.5 text-sm text-faint">Platform revenue, wallets, and the full transactions ledger</p>
      </div>

      <div className="mb-7 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3.5">
        <StatCard icon={TrendingUp} label="Platform revenue (month)" value={formatNaira(summary.platformRevenue)} color="#1A9E5F" />
        <StatCard icon={Megaphone} label="Promotion revenue (month)" value={formatNaira(summary.promotionRevenue)} color="#378ADD" />
        <StatCard icon={Wallet} label="Total held in creator wallets" value={formatNaira(summary.totalWalletBalance)} color="#D4A017" />
        <StatCard icon={ArrowDownCircle} label="Pending withdrawals" value={String(summary.pendingWithdrawals)} danger={summary.pendingWithdrawals > 0} />
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {TYPE_TABS.map(tab => (
          <Link
            key={tab.key}
            href={`?type=${tab.key}`}
            className="flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 font-display text-[13px] font-semibold no-underline sm:px-4"
            style={{
              color: activeType === tab.key ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
              borderBottomColor: activeType === tab.key ? 'var(--color-brand)' : 'transparent',
            }}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <DataTable columns={columns} rows={rows} keyField="id" emptyMessage="No transactions found" />
      <AdminPagination page={page} totalPages={totalPages} basePath="/finance" extraParams={activeType !== 'all' ? `type=${activeType}` : ''} />
    </div>
  )
}
