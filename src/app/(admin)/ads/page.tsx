// src/app/(admin)/ads/page.tsx
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { formatNaira, formatNumber } from '@/lib/utils'
import AdReviewActions from './ad-review-actions'

interface SearchParams { status?: string }

async function getAds(params: SearchParams) {
  const admin = createAdminClient()
  const status = params.status || 'pending_review'

  const { data } = await admin
    .from('ads')
    .select(`
      id, title, body, image_url, destination_url, cta_label, format, source,
      status, review_notes, budget_kobo, spent_kobo, cpm_kobo,
      impressions, clicks, created_at, starts_at, ends_at,
      advertiser:advertisers(id, business_name, contact_email, verified)
    `)
    .eq('status', status)
    .order('created_at', { ascending: true })
    .limit(50)

  return data || []
}

async function getAdCounts() {
  const admin = createAdminClient()
  const statuses = ['pending_review', 'active', 'paused', 'rejected', 'completed']
  const counts: Record<string, number> = {}
  await Promise.all(statuses.map(async s => {
    const { count } = await admin.from('ads').select('id', { count: 'exact', head: true }).eq('status', s)
    counts[s] = count || 0
  }))
  return counts
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending_review: { bg: 'rgba(212,160,23,0.12)',  color: '#D4A017' },
  active:         { bg: 'rgba(26,158,95,0.12)',   color: '#1A9E5F' },
  paused:         { bg: 'rgba(55,138,221,0.12)',  color: '#378ADD' },
  rejected:       { bg: 'rgba(229,57,53,0.12)',   color: '#E53935' },
  completed:      { bg: 'rgba(100,100,100,0.12)', color: '#555' },
}

export default async function AdminAdsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const [ads, counts] = await Promise.all([getAds(params), getAdCounts()])
  const activeStatus = params.status || 'pending_review'

  const TABS = [
    { key: 'pending_review', label: 'Pending review' },
    { key: 'active',         label: 'Active' },
    { key: 'paused',         label: 'Paused' },
    { key: 'rejected',       label: 'Rejected' },
    { key: 'completed',      label: 'Completed' },
  ]

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Ads</h1>
        <p className="mt-0.5 text-sm text-faint">Campaign review and management</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map(tab => (
          <Link
            key={tab.key}
            href={`?status=${tab.key}`}
            className="flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 font-display text-[13px] font-semibold no-underline sm:px-4"
            style={{
              color: activeStatus === tab.key ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
              borderBottomColor: activeStatus === tab.key ? 'var(--color-brand)' : 'transparent',
            }}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span
                className="rounded-lg px-1.5 py-0.5 text-[10px] font-extrabold"
                style={{
                  background: tab.key === 'pending_review' ? 'var(--color-gold)' : 'var(--color-surface-3)',
                  color: tab.key === 'pending_review' ? '#000' : 'var(--color-text-secondary)',
                }}
              >
                {counts[tab.key]}
              </span>
            )}
          </Link>
        ))}
      </div>

      {ads.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface px-5 py-16 text-center">
          <p className="text-[15px] text-faint">No {activeStatus.replace('_', ' ')} ads</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {ads.map((ad: any) => {
            const pill = STATUS_STYLE[ad.status] || STATUS_STYLE.pending_review
            const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : '0.00'
            const metrics = [
              { label: 'Budget', value: formatNaira(ad.budget_kobo) },
              { label: 'Spent', value: formatNaira(ad.spent_kobo) },
              { label: 'CPM', value: formatNaira(ad.cpm_kobo) },
              { label: 'Impressions', value: formatNumber(ad.impressions) },
              { label: 'Clicks', value: formatNumber(ad.clicks) },
              { label: 'CTR', value: `${ctr}%` },
            ]
            return (
              <div key={ad.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
                {/* Ad header */}
                <div className="flex flex-col gap-3.5 border-b border-[#141418] p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-5">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="font-display text-base font-bold text-primary">{ad.title}</span>
                      <span className="rounded px-2 py-0.5 text-[11px] font-bold" style={{ background: pill.bg, color: pill.color }}>
                        {ad.status.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className="rounded bg-[color:var(--color-surface-3)] px-1.5 py-0.5 text-[11px] text-faint">
                        {ad.source?.toUpperCase()}
                      </span>
                    </div>
                    {ad.body && <p className="mb-2 text-sm leading-relaxed text-secondary">{ad.body}</p>}
                    <div className="break-words text-xs text-faint">
                      <strong className="text-secondary">{ad.advertiser?.business_name}</strong>
                      {' · '}{ad.advertiser?.contact_email}
                      {ad.advertiser?.verified && <span className="ml-1.5 text-brand">✓ verified</span>}
                    </div>
                  </div>
                  {ad.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ad.image_url}
                      alt=""
                      className="h-[60px] w-20 flex-shrink-0 self-start rounded-lg border border-border object-cover sm:self-auto"
                    />
                  )}
                </div>

                {/* Metrics row */}
                <div className={`grid grid-cols-3 sm:grid-cols-6 ${ad.status === 'pending_review' ? 'border-b border-[#141418]' : ''}`}>
                  {metrics.map(m => (
                    <div key={m.label} className="border-b border-r border-[#141418] p-3 last:border-r-0 sm:border-b-0 sm:p-4">
                      <div className="mb-1 text-[11px] tracking-wide text-faint">{m.label.toUpperCase()}</div>
                      <div className="font-display text-sm font-bold text-[#D0D0C8]">{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* Review actions */}
                {ad.status === 'pending_review' && (
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
                    <a href={ad.destination_url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-brand no-underline">
                      Preview destination →
                    </a>
                    <div className="sm:ml-auto">
                      <AdReviewActions adId={ad.id} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
