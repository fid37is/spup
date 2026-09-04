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
    <div style={{ padding: '28px 32px', maxWidth: 760 }}>
      <Link href="/finance" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#6A6A60', textDecoration: 'none', fontSize: 13, marginBottom: 20 }}>
        <ArrowLeft size={14} /> Back to finance
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em', textTransform: 'capitalize' }}>
            {txn.type.replace(/_/g, ' ')}
          </h1>
          <p style={{ fontSize: 13, color: '#44444A', marginTop: 2, fontFamily: 'monospace' }}>{txn.id}</p>
        </div>
        <StatusBadge status={txn.status} />
      </div>

      {/* Amount hero */}
      <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, padding: 24, marginBottom: 20, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 36, letterSpacing: '-0.02em', color: isCredit ? '#1A9E5F' : '#E53935' }}>
          {isCredit ? '+' : '-'}{formatNaira(txn.amount_kobo)}
        </div>
        {txn.platform_fee_kobo > 0 && (
          <div style={{ fontSize: 12, color: '#44444A', marginTop: 6 }}>Platform fee: {formatNaira(txn.platform_fee_kobo)}</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Wallet / user */}
        <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#44444A', marginBottom: 14 }}>ACCOUNT</div>
          {txn.wallet?.user ? (
            <>
              <Link href={`/users/${txn.wallet.user.id}`} style={{ textDecoration: 'none' }}>
                <DetailRow label="User" value={<span style={{ color: '#378ADD' }}>@{txn.wallet.user.username}</span>} />
              </Link>
              <DetailRow label="Display name" value={txn.wallet.user.display_name} />
              <DetailRow label="Wallet balance" value={<span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Wallet size={12} /> {formatNaira(txn.wallet.balance_kobo)}</span>} />
            </>
          ) : (
            <p style={{ fontSize: 13, color: '#44444A' }}>No wallet linked</p>
          )}
        </div>

        {/* Record details */}
        <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#44444A', marginBottom: 14 }}>RECORD</div>
          <DetailRow label="Reference" value={<span style={{ fontFamily: 'monospace', fontSize: 12 }}>{txn.reference || '—'}</span>} />
          <DetailRow label="Created" value={formatRelativeTime(txn.created_at)} />
          <DetailRow label="Completed" value={txn.completed_at ? formatRelativeTime(txn.completed_at) : '—'} />
        </div>
      </div>

      {txn.description && (
        <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, padding: 20, marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#44444A', marginBottom: 10 }}>DESCRIPTION</div>
          <p style={{ fontSize: 13, color: '#D0D0C8' }}>{txn.description}</p>
        </div>
      )}

      {txn.metadata && Object.keys(txn.metadata).length > 0 && (
        <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, padding: 20, marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#44444A', marginBottom: 10 }}>METADATA</div>
          <pre style={{ fontSize: 12, color: '#8A8A85', fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: 0 }}>
            {JSON.stringify(txn.metadata, null, 2)}
          </pre>
        </div>
      )}

      {/* Audit trail */}
      <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, padding: 20, marginTop: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#44444A', marginBottom: 14 }}>ADMIN AUDIT TRAIL</div>
        {audit.length === 0 ? (
          <p style={{ fontSize: 13, color: '#44444A' }}>No admin actions recorded against this transaction.</p>
        ) : audit.map(row => (
          <div key={row.id} style={{ padding: '10px 0', borderBottom: '1px solid #141418', fontSize: 13 }}>
            <span style={{ color: '#F0F0EC', fontWeight: 600 }}>{row.admin?.display_name || 'System'}</span>
            <span style={{ color: '#8A8A85' }}> — {row.action.replace(/_/g, ' ')}</span>
            <span style={{ color: '#44444A', float: 'right' }}>{formatRelativeTime(row.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #141418', fontSize: 13 }}>
      <span style={{ color: '#6A6A60' }}>{label}</span>
      <span style={{ color: '#D0D0C8' }}>{value}</span>
    </div>
  )
}