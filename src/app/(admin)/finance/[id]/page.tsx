// src/app/(admin)/finance/[id]/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatNaira, formatRelativeTime } from '@/lib/utils'
import { ArrowLeft, Wallet } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { StatusBadge } from '@/components/admin/status-badge'

interface TxnDetail {
  id: string
  type: string
  amount_kobo: number
  platform_fee_kobo: number
  status: string
  reference: string | null
  description: string | null
  metadata: Record<string, unknown> | null
  entity_id: string | null
  created_at: string
  completed_at: string | null
  wallet: {
    id: string
    balance_kobo: number
    user: { id: string; username: string; display_name: string } | null
  } | null
}

interface AuditRow {
  id: string
  action: string
  metadata: Record<string, unknown> | null
  created_at: string
  admin: { username: string; display_name: string } | null
}

async function getTransaction(id: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('transactions')
    .select(`
      id, type, amount_kobo, platform_fee_kobo, status, reference, description, metadata, entity_id,
      created_at, completed_at,
      wallet:wallets(id, balance_kobo, user:users(id, username, display_name))
    `)
    .eq('id', id)
    .single()

  return data as unknown as TxnDetail | null
}

async function getAuditTrail(transactionId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('admin_audit_log')
    .select('id, action, metadata, created_at, admin:users!admin_audit_log_admin_id_fkey(username, display_name)')
    .eq('target_type', 'transaction')
    .eq('target_id', transactionId)
    .order('created_at', { ascending: false })

  return (data || []) as unknown as AuditRow[]
}

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [txn, audit] = await Promise.all([getTransaction(id), getAuditTrail(id)])
  if (!txn) notFound()

  const isCredit = txn.type !== 'withdrawal'

  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <Link href="/finance" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-faint no-underline">
        <ArrowLeft size={14} /> Back to finance
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold capitalize tracking-tight text-primary">
            {txn.type.replace(/_/g, ' ')}
          </h1>
          <p className="mt-0.5 truncate font-mono text-[13px] text-faint">{txn.id}</p>
        </div>
        <StatusBadge status={txn.status} />
      </div>

      {/* Amount hero */}
      <div className="mb-5 rounded-2xl border border-border bg-surface p-6 text-center">
        <div className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ color: isCredit ? 'var(--color-brand)' : 'var(--color-error)' }}>
          {isCredit ? '+' : '-'}{formatNaira(txn.amount_kobo)}
        </div>
        {txn.platform_fee_kobo > 0 && (
          <div className="mt-1.5 text-xs text-faint">Platform fee: {formatNaira(txn.platform_fee_kobo)}</div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        {/* Wallet / user */}
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="mb-3.5 text-[11px] font-bold tracking-wide text-faint">ACCOUNT</div>
          {txn.wallet?.user ? (
            <>
              <Link href={`/users/${txn.wallet.user.id}`} className="block no-underline">
                <DetailRow label="User" value={<span className="text-[#378ADD]">@{txn.wallet.user.username}</span>} />
              </Link>
              <DetailRow label="Display name" value={txn.wallet.user.display_name} />
              <DetailRow label="Wallet balance" value={<span className="flex items-center gap-1"><Wallet size={12} /> {formatNaira(txn.wallet.balance_kobo)}</span>} />
            </>
          ) : (
            <p className="text-[13px] text-faint">No wallet linked</p>
          )}
        </div>

        {/* Record details */}
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="mb-3.5 text-[11px] font-bold tracking-wide text-faint">RECORD</div>
          <DetailRow label="Reference" value={<span className="font-mono text-xs">{txn.reference || '—'}</span>} />
          <DetailRow label="Created" value={formatRelativeTime(txn.created_at)} />
          <DetailRow label="Completed" value={txn.completed_at ? formatRelativeTime(txn.completed_at) : '—'} />
        </div>
      </div>

      {txn.description && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4 sm:mt-5 sm:p-5">
          <div className="mb-2.5 text-[11px] font-bold tracking-wide text-faint">DESCRIPTION</div>
          <p className="text-[13px] text-[#D0D0C8]">{txn.description}</p>
        </div>
      )}

      {txn.metadata && Object.keys(txn.metadata).length > 0 && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4 sm:mt-5 sm:p-5">
          <div className="mb-2.5 text-[11px] font-bold tracking-wide text-faint">METADATA</div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-secondary">
            {JSON.stringify(txn.metadata, null, 2)}
          </pre>
        </div>
      )}

      {/* Audit trail */}
      <div className="mt-4 rounded-2xl border border-border bg-surface p-4 sm:mt-5 sm:p-5">
        <div className="mb-3.5 text-[11px] font-bold tracking-wide text-faint">ADMIN AUDIT TRAIL</div>
        {audit.length === 0 ? (
          <p className="text-[13px] text-faint">No admin actions recorded against this transaction.</p>
        ) : audit.map(row => (
          <div key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-b border-[#141418] py-2.5 text-[13px] last:border-b-0">
            <span>
              <span className="font-semibold text-primary">{row.admin?.display_name || 'System'}</span>
              <span className="text-secondary"> — {row.action.replace(/_/g, ' ')}</span>
            </span>
            <span className="text-xs text-faint">{formatRelativeTime(row.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b border-[#141418] py-1.5 text-[13px] last:border-b-0">
      <span className="text-secondary">{label}</span>
      <span className="text-[#D0D0C8]">{value}</span>
    </div>
  )
}
