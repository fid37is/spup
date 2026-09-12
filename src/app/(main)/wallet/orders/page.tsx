import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getMyEscrowOrders } from '@/lib/queries/escrow'
import { formatNaira } from '@/lib/utils'
import Link from 'next/link'
import { ShieldCheck, Package } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  held: 'Awaiting delivery',
  delivered_by_seller: 'Awaiting your confirmation',
  released: 'Completed',
  disputed: 'Disputed',
  refunded: 'Refunded',
}

const STATUS_COLOR: Record<string, string> = {
  held: 'var(--color-gold)',
  delivered_by_seller: 'var(--color-gold)',
  released: 'var(--color-brand)',
  disputed: 'var(--color-error)',
  refunded: 'var(--color-text-muted)',
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const role = params.role === 'selling' ? 'seller' : 'buyer'

  const { orders, error } = await getMyEscrowOrders(role)

  return (
    <div>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(20px)',
        background: 'var(--nav-bg)', borderBottom: '1px solid var(--color-border)', padding: '16px 20px',
      }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--color-text-primary)' }}>
          Orders
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
          Pay through Spup — funds stay locked until delivery is confirmed.
        </p>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--color-border)' }}>
          <Link href="/wallet/orders?role=buying" style={{
            padding: '10px 16px', textDecoration: 'none', fontSize: 14,
            fontFamily: "'Syne', sans-serif", fontWeight: 700,
            color: role === 'buyer' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            borderBottom: role === 'buyer' ? '2px solid var(--color-brand)' : '2px solid transparent',
          }}>
            Buying
          </Link>
          <Link href="/wallet/orders?role=selling" style={{
            padding: '10px 16px', textDecoration: 'none', fontSize: 14,
            fontFamily: "'Syne', sans-serif", fontWeight: 700,
            color: role === 'seller' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            borderBottom: role === 'seller' ? '2px solid var(--color-brand)' : '2px solid transparent',
          }}>
            Selling
          </Link>
        </div>

        {error && (
          <p style={{ fontSize: 14, color: 'var(--color-error)', textAlign: 'center', padding: '40px 0' }}>{error}</p>
        )}

        {!error && (!orders || orders.length === 0) && (
          <div style={{ padding: '48px 0', textAlign: 'center', border: '1px solid var(--color-border)', borderRadius: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Package size={22} color="var(--color-text-muted)" />
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              {role === 'buyer' ? 'No purchases yet' : 'No sales yet'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {role === 'buyer' ? 'Pay a vendor on a post to see it here.' : 'Escrow payments you receive will show up here.'}
            </p>
          </div>
        )}

        {!error && orders && orders.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orders.map((order: any) => {
              const counterparty = role === 'buyer' ? order.seller : order.buyer
              return (
                <Link
                  key={order.id}
                  href={`/wallet/orders/${order.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                    border: '1px solid var(--color-border)', borderRadius: 14, textDecoration: 'none',
                  }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldCheck size={16} color="var(--color-brand)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 3 }}>
                      @{counterparty?.username || 'unknown'}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLOR[order.status] }}>
                      {STATUS_LABEL[order.status] || order.status}
                    </span>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Syne', sans-serif", color: 'var(--color-text-primary)', flexShrink: 0 }}>
                    {formatNaira(order.amount_kobo)}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
