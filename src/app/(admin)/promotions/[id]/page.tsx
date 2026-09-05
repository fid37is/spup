// src/app/(admin)/promotions/[id]/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatNaira, formatNumber, formatRelativeTime } from '@/lib/utils'
import { ArrowLeft, Eye, MousePointerClick, Heart, MessageCircle, Repeat2 } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { StatCard } from '@/components/admin/stat-card'
import { StatusBadge } from '@/components/admin/status-badge'
import PromotionActions from '../promotion-actions'

interface PromotionDetail {
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
  post: {
    id: string
    body: string | null
    likes_count: number
    comments_count: number
    reposts_count: number
    created_at: string
  } | null
  user: { id: string; username: string; display_name: string; avatar_url: string | null } | null
}

interface LinkedTxn {
  id: string
  amount_kobo: number
  status: string
  reference: string | null
  completed_at: string | null
}

async function getPromotion(id: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('post_promotions')
    .select(`
      id, tier, price_kobo, duration_hours, status, impressions_count, clicks_count,
      starts_at, ends_at, created_at,
      post:posts(id, body, likes_count, comments_count, reposts_count, created_at),
      user:users(id, username, display_name, avatar_url)
    `)
    .eq('id', id)
    .single()

  return data as unknown as PromotionDetail | null
}

async function getLinkedTransaction(reference: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('transactions')
    .select('id, amount_kobo, status, reference, completed_at')
    .eq('reference', `${reference}-TXN`)
    .maybeSingle()

  return data as LinkedTxn | null
}

export default async function PromotionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const promotion = await getPromotion(id)
  if (!promotion) notFound()

  // reference lives on the promotion row itself but wasn't selected above; refetch minimal field
  const admin = createAdminClient()
  const { data: refRow } = await admin.from('post_promotions').select('reference').eq('id', id).single()
  const linkedTxn = refRow?.reference ? await getLinkedTransaction(refRow.reference) : null

  const ctr = promotion.impressions_count > 0
    ? ((promotion.clicks_count / promotion.impressions_count) * 100).toFixed(2)
    : '0.00'

  return (
    <div style={{ padding: '28px 32px', maxWidth: 880 }}>
      <Link href="/promotions" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#6A6A60', textDecoration: 'none', fontSize: 13, marginBottom: 20 }}>
        <ArrowLeft size={14} /> Back to promotions
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em' }}>
            Promotion detail
          </h1>
          <p style={{ fontSize: 13, color: '#44444A', marginTop: 2, fontFamily: 'monospace' }}>{promotion.id}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StatusBadge status={promotion.status} />
          {promotion.status === 'active' && <PromotionActions promotionId={promotion.id} />}
        </div>
      </div>

      {/* Post preview */}
      <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#44444A', marginBottom: 12 }}>PROMOTED POST</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            background: '#1E1E26', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Syne', sans-serif", fontWeight: 700, color: '#6A6A60', fontSize: 15,
          }}>
            {promotion.user?.display_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#F0F0EC', fontFamily: "'Syne', sans-serif" }}>{promotion.user?.display_name}</span>
              <Link href={`/users/${promotion.user?.id}`} style={{ fontSize: 13, color: '#44444A', textDecoration: 'none' }}>@{promotion.user?.username}</Link>
            </div>
            <p style={{ fontSize: 14, color: '#D0D0C8', marginTop: 6, lineHeight: 1.5 }}>{promotion.post?.body || '(no text)'}</p>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: '#44444A' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Heart size={13} /> {formatNumber(promotion.post?.likes_count || 0)}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MessageCircle size={13} /> {formatNumber(promotion.post?.comments_count || 0)}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Repeat2 size={13} /> {formatNumber(promotion.post?.reposts_count || 0)}</span>
              {promotion.post?.id && (
                <Link href={`/post/${promotion.post.id}`} style={{ color: '#378ADD', textDecoration: 'none', marginLeft: 'auto' }}>View live post →</Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Performance stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard icon={Eye} label="Impressions" value={formatNumber(promotion.impressions_count)} color="#378ADD" />
        <StatCard icon={MousePointerClick} label="Clicks" value={formatNumber(promotion.clicks_count)} color="#D4A017" />
        <StatCard icon={MousePointerClick} label="Click-through rate" value={`${ctr}%`} />
      </div>

      {/* Package + timeline */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#44444A', marginBottom: 14 }}>PACKAGE</div>
          <DetailRow label="Tier" value={<span style={{ textTransform: 'capitalize' }}>{promotion.tier}</span>} />
          <DetailRow label="Price paid" value={<span style={{ color: '#1A9E5F', fontWeight: 700 }}>{formatNaira(promotion.price_kobo)}</span>} />
          <DetailRow label="Duration" value={`${promotion.duration_hours} hours`} />
        </div>

        <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#44444A', marginBottom: 14 }}>TIMELINE</div>
          <DetailRow label="Requested" value={formatRelativeTime(promotion.created_at)} />
          <DetailRow label="Started" value={promotion.starts_at ? formatRelativeTime(promotion.starts_at) : '—'} />
          <DetailRow label="Ends / ended" value={promotion.ends_at ? formatRelativeTime(promotion.ends_at) : '—'} />
        </div>
      </div>

      {/* Linked payment */}
      <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, padding: 20, marginTop: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#44444A', marginBottom: 14 }}>LINKED PAYMENT</div>
        {linkedTxn ? (
          <Link href={`/finance/${linkedTxn.id}`} style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, color: '#F0F0EC', fontFamily: 'monospace' }}>{linkedTxn.reference}</div>
                <div style={{ fontSize: 12, color: '#44444A', marginTop: 2 }}>
                  {linkedTxn.completed_at ? formatRelativeTime(linkedTxn.completed_at) : 'Not completed yet'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <StatusBadge status={linkedTxn.status} />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1A9E5F', fontFamily: "'Syne', sans-serif" }}>{formatNaira(linkedTxn.amount_kobo)}</span>
              </div>
            </div>
          </Link>
        ) : (
          <p style={{ fontSize: 13, color: '#44444A' }}>No completed payment found for this promotion yet.</p>
        )}
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