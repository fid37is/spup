import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getEscrowOrder } from '@/lib/queries/escrow'
import { formatNaira } from '@/lib/utils'
import OrderActions from './order-actions'
import { ShieldCheck } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  held: 'Payment held in escrow',
  delivered_by_seller: 'Marked delivered — awaiting confirmation',
  released: 'Completed — funds released',
  disputed: 'Disputed',
  refunded: 'Refunded to buyer',
}

const STATUS_COLOR: Record<string, string> = {
  held: 'var(--color-gold)',
  delivered_by_seller: 'var(--color-gold)',
  released: 'var(--color-brand)',
  disputed: 'var(--color-error)',
  refunded: 'var(--color-text-muted)',
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params
  const { order, dispute, viewer_role, error } = await getEscrowOrder(id)

  if (error || !order) notFound()

  const counterparty = viewer_role === 'buyer' ? order.seller : order.buyer

  return (
    <div>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(20px)',
        background: 'var(--nav-bg)', borderBottom: '1px solid var(--color-border)', padding: '16px 20px',
      }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--color-text-primary)' }}>
          Order {order.reference}
        </h1>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>

        <div style={{ border: '1px solid var(--color-border)', borderRadius: 20, padding: '24px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[order.status] }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: STATUS_COLOR[order.status] }}>
              {STATUS_LABEL[order.status] || order.status}
            </span>
          </div>

          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 32, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', marginBottom: 6 }}>
            {formatNaira(order.amount_kobo)}
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>
            {viewer_role === 'buyer' ? 'Paid to' : 'Paid by'} <strong style={{ color: 'var(--color-text-secondary)' }}>@{counterparty?.username || 'unknown'}</strong>
          </p>

          {order.note && (
            <div style={{ background: 'var(--color-surface-2)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Note</div>
              <div style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{order.note}</div>
            </div>
          )}

          {order.status === 'delivered_by_seller' && order.auto_release_at && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--color-surface-2)', borderRadius: 12, marginBottom: 4 }}>
              <ShieldCheck size={16} color="var(--color-gold)" />
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                {viewer_role === 'buyer'
                  ? `Funds auto-release to the seller on ${new Date(order.auto_release_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long' })} if you don't respond.`
                  : `Funds auto-release to you on ${new Date(order.auto_release_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long' })} if the buyer doesn't respond.`}
              </span>
            </div>
          )}
        </div>

        <OrderActions
          orderId={order.id}
          status={order.status}
          viewerRole={viewer_role}
          dispute={dispute}
        />
      </div>
    </div>
  )
}
