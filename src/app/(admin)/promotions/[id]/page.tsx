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
    <div className="mx-auto max-w-[880px] px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <Link href="/promotions" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-faint no-underline">
        <ArrowLeft size={14} /> Back to promotions
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">
            Promotion detail
          </h1>
          <p className="mt-0.5 truncate font-mono text-[13px] text-faint">{promotion.id}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={promotion.status} />
          {promotion.status === 'active' && <PromotionActions promotionId={promotion.id} />}
        </div>
      </div>

      {/* Post preview */}
      <div className="mb-5 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="mb-3 text-[11px] font-bold tracking-wide text-faint">PROMOTED POST</div>
        <div className="flex gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[color:var(--color-surface-3)] font-display text-[15px] font-bold text-secondary">
            {promotion.user?.display_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="font-display text-sm font-bold text-primary">{promotion.user?.display_name}</span>
              <Link href={`/users/${promotion.user?.id}`} className="text-[13px] text-faint no-underline">@{promotion.user?.username}</Link>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-[#D0D0C8]">{promotion.post?.body || '(no text)'}</p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-faint">
              <span className="flex items-center gap-1"><Heart size={13} /> {formatNumber(promotion.post?.likes_count || 0)}</span>
              <span className="flex items-center gap-1"><MessageCircle size={13} /> {formatNumber(promotion.post?.comments_count || 0)}</span>
              <span className="flex items-center gap-1"><Repeat2 size={13} /> {formatNumber(promotion.post?.reposts_count || 0)}</span>
              {promotion.post?.id && (
                <Link href={`/post/${promotion.post.id}`} className="ml-auto text-[#378ADD] no-underline">View live post →</Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Performance stats */}
      <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3.5">
        <StatCard icon={Eye} label="Impressions" value={formatNumber(promotion.impressions_count)} color="#378ADD" />
        <StatCard icon={MousePointerClick} label="Clicks" value={formatNumber(promotion.clicks_count)} color="#D4A017" />
        <StatCard icon={MousePointerClick} label="Click-through rate" value={`${ctr}%`} />
      </div>

      {/* Package + timeline */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="mb-3.5 text-[11px] font-bold tracking-wide text-faint">PACKAGE</div>
          <DetailRow label="Tier" value={<span className="capitalize">{promotion.tier}</span>} />
          <DetailRow label="Price paid" value={<span className="font-bold text-brand">{formatNaira(promotion.price_kobo)}</span>} />
          <DetailRow label="Duration" value={`${promotion.duration_hours} hours`} />
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="mb-3.5 text-[11px] font-bold tracking-wide text-faint">TIMELINE</div>
          <DetailRow label="Requested" value={formatRelativeTime(promotion.created_at)} />
          <DetailRow label="Started" value={promotion.starts_at ? formatRelativeTime(promotion.starts_at) : '—'} />
          <DetailRow label="Ends / ended" value={promotion.ends_at ? formatRelativeTime(promotion.ends_at) : '—'} />
        </div>
      </div>

      {/* Linked payment */}
      <div className="mt-4 rounded-2xl border border-border bg-surface p-4 sm:mt-5 sm:p-5">
        <div className="mb-3.5 text-[11px] font-bold tracking-wide text-faint">LINKED PAYMENT</div>
        {linkedTxn ? (
          <Link href={`/finance/${linkedTxn.id}`} className="block no-underline">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="truncate font-mono text-[13px] text-primary">{linkedTxn.reference}</div>
                <div className="mt-0.5 text-xs text-faint">
                  {linkedTxn.completed_at ? formatRelativeTime(linkedTxn.completed_at) : 'Not completed yet'}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={linkedTxn.status} />
                <span className="font-display text-sm font-bold text-brand">{formatNaira(linkedTxn.amount_kobo)}</span>
              </div>
            </div>
          </Link>
        ) : (
          <p className="text-[13px] text-faint">No completed payment found for this promotion yet.</p>
        )}
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
