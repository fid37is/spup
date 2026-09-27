// src/app/(admin)/promo-codes/page.tsx
//
// This route had no page.tsx - the generate/revoke UI in promo-codes-client.tsx
// existed but was never mounted anywhere, so the nav link 404'd and there was
// no way for an admin to actually create a code. This wires it up the same way
// every other (admin) route does: server-fetch with createAdminClient, render
// with the shared DataTable/StatusBadge components.

import { createAdminClient } from '@/lib/supabase/server'
import { Ticket } from 'lucide-react'
import { formatNumber, formatRelativeTime } from '@/lib/utils'
import { StatCard } from '@/components/admin/stat-card'
import { StatusBadge } from '@/components/admin/status-badge'
import { DataTable, type Column } from '@/components/admin/data-table'
import { TIERS } from '@/lib/promotions'
import { GeneratePromoCodeForm, RevokePromoCodeButton } from './promo-codes-client'

interface PromoCodeRow {
  id: string
  code: string
  label: string | null
  tier: string | null
  max_uses: number
  times_used: number
  status: 'active' | 'revoked'
  expires_at: string | null
  created_at: string
  creator: { username: string; display_name: string } | null
}

async function getPromoCodes() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('promo_codes')
    .select(`
      id, code, label, tier, max_uses, times_used, status, expires_at, created_at,
      creator:users!promo_codes_created_by_fkey(username, display_name)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  return (data || []) as unknown as PromoCodeRow[]
}

async function getCounts() {
  const admin = createAdminClient()
  const [{ count: activeCount }, { data: usage }] = await Promise.all([
    admin.from('promo_codes').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('promo_codes').select('times_used'),
  ])

  const totalRedemptions = (usage || []).reduce((sum: number, r: { times_used: number }) => sum + r.times_used, 0)
  return { activeCount: activeCount || 0, totalRedemptions }
}

function tierLabel(tier: string | null) {
  if (!tier) return 'Any tier'
  return (TIERS as Record<string, { label: string }>)[tier]?.label || tier
}

function rowStatus(row: PromoCodeRow) {
  if (row.status === 'revoked') return 'revoked'
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return 'expired'
  if (row.times_used >= row.max_uses) return 'exhausted'
  return 'active'
}

export default async function AdminPromoCodesPage() {
  const [codes, counts] = await Promise.all([getPromoCodes(), getCounts()])

  const columns: Column<PromoCodeRow>[] = [
    {
      key: 'code', header: 'Code', width: '22%',
      render: r => (
        <div>
          <div className="font-display text-[13px] font-bold tracking-widest text-primary">{r.code}</div>
          {r.label && <div className="mt-0.5 max-w-[260px] truncate text-xs text-faint">{r.label}</div>}
        </div>
      ),
    },
    { key: 'tier', header: 'Tier', mobileHidden: true, render: r => <span className="text-[13px] text-secondary">{tierLabel(r.tier)}</span> },
    { key: 'uses', header: 'Uses', align: 'right', render: r => <span className="text-[13px] text-[#D0D0C8]">{r.times_used} / {r.max_uses}</span> },
    { key: 'expires', header: 'Expires', mobileHidden: true, render: r => <span className="text-xs text-faint">{r.expires_at ? formatRelativeTime(r.expires_at) : 'Never'}</span> },
    { key: 'creator', header: 'Created by', mobileHidden: true, render: r => <span className="text-xs text-faint">{r.creator ? `@${r.creator.username}` : '—'}</span> },
    { key: 'status', header: 'Status', render: r => <StatusBadge status={rowStatus(r)} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: r => r.status === 'active' ? <RevokePromoCodeButton codeId={r.id} /> : null,
    },
  ]

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Promo codes</h1>
        <p className="mt-0.5 text-sm text-faint">Comp promotions for affiliates and campaigns, redeemed instead of paying via Paystack</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3.5">
        <StatCard icon={Ticket} label="Active codes" value={formatNumber(counts.activeCount)} />
        <StatCard icon={Ticket} label="Total redemptions" value={formatNumber(counts.totalRedemptions)} color="#378ADD" />
      </div>

      <GeneratePromoCodeForm />

      <DataTable
        columns={columns}
        rows={codes}
        keyField="id"
        emptyMessage="No promo codes yet"
      />
    </div>
  )
}
