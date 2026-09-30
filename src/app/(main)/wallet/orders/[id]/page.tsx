import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getEscrowOrder } from '@/lib/queries/escrow'
import { formatNaira } from '@/lib/utils'
import OrderActions from './order-actions'
import { ShieldCheck } from 'lucide-react'
import { getProfileByAuthId } from '@/lib/queries/users'
import { isLocale, DEFAULT_LOCALE, loadDictionary, translate } from '@/lib/i18n/dictionaries'

function statusLabel(t: (key: string, vars?: Record<string, string | number>) => string): Record<string, string> {
  return {
    held: t('wallet.detail_status_held'),
    delivered_by_seller: t('wallet.detail_status_delivered'),
    released: t('wallet.detail_status_released'),
    disputed: t('wallet.status_disputed'),
    refunded: t('wallet.detail_status_refunded'),
  }
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

  const profile = await getProfileByAuthId(user.id)
  const locale = isLocale(profile?.language_preference) ? profile!.language_preference : DEFAULT_LOCALE
  const dict = await loadDictionary(locale)
  const t = (key: string, vars?: Record<string, string | number>) => translate(dict, key, vars)
  const STATUS_LABEL = statusLabel(t)

  const { id } = await params
  const { order, dispute, viewer_role, error } = await getEscrowOrder(id)

  if (error || !order || !viewer_role) notFound()

  const counterparty = viewer_role === 'buyer' ? order.seller : order.buyer

  return (
    <div>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(20px)',
        background: 'var(--nav-bg)', borderBottom: '1px solid var(--color-border)', padding: '16px 20px',
      }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--color-text-primary)' }}>
          {t('wallet.order_ref_title', { ref: order.reference })}
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
            {viewer_role === 'buyer' ? t('wallet.paid_to') : t('wallet.paid_by')} <strong style={{ color: 'var(--color-text-secondary)' }}>@{counterparty?.username || t('wallet.unknown_user')}</strong>
          </p>

          {order.note && (
            <div style={{ background: 'var(--color-surface-2)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('wallet.note_label')}</div>
              <div style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{order.note}</div>
            </div>
          )}

          {order.status === 'delivered_by_seller' && order.auto_release_at && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--color-surface-2)', borderRadius: 12, marginBottom: 4 }}>
              <ShieldCheck size={16} color="var(--color-gold)" />
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                {viewer_role === 'buyer'
                  ? t('wallet.auto_release_buyer', { date: new Date(order.auto_release_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long' }) })
                  : t('wallet.auto_release_seller', { date: new Date(order.auto_release_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long' }) })}
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