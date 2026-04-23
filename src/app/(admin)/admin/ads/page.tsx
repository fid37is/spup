// src/app/(admin)/admin/ads/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatNaira, formatNumber, formatRelativeTime } from '@/lib/utils'
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
    <div style={{ padding: '28px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em' }}>Ads</h1>
        <p style={{ fontSize: 14, color: '#44444A', marginTop: 2 }}>Campaign review and management</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #1E1E26' }}>
        {TABS.map(tab => (
          <a
            key={tab.key}
            href={`?status=${tab.key}`}
            style={{
              padding: '10px 16px', textDecoration: 'none', fontSize: 13,
              fontFamily: "'Syne', sans-serif", fontWeight: 600,
              color: activeStatus === tab.key ? '#F0F0EC' : '#44444A',
              borderBottom: activeStatus === tab.key ? '2px solid #1A9E5F' : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span style={{
                background: tab.key === 'pending_review' && counts[tab.key] > 0 ? '#D4A017' : '#1E1E26',
                color: tab.key === 'pending_review' && counts[tab.key] > 0 ? '#000' : '#6A6A60',
                fontSize: 10, fontWeight: 800, borderRadius: 8, padding: '1px 6px',
              }}>
                {counts[tab.key]}
              </span>
            )}
          </a>
        ))}
      </div>

      {ads.length === 0 ? (
        <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, padding: '60px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: '#44444A' }}>No {activeStatus.replace('_', ' ')} ads</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {ads.map((ad: any) => {
            const pill = STATUS_STYLE[ad.status] || STATUS_STYLE.pending_review
            const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : '0.00'
            return (
              <div key={ad.id} style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, overflow: 'hidden' }}>
                {/* Ad header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #141418', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: '#F0F0EC' }}>{ad.title}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, background: pill.bg, color: pill.color, padding: '2px 8px', borderRadius: 5 }}>
                        {ad.status.replace('_', ' ').toUpperCase()}
                      </span>
                      <span style={{ fontSize: 11, color: '#44444A', background: '#1A1A20', padding: '2px 7px', borderRadius: 5 }}>
                        {ad.source?.toUpperCase()}
                      </span>
                    </div>
                    {ad.body && <p style={{ fontSize: 14, color: '#8A8A85', lineHeight: 1.5, margin: 0, marginBottom: 8 }}>{ad.body}</p>}
                    <div style={{ fontSize: 12, color: '#44444A' }}>
                      <strong style={{ color: '#6A6A60' }}>{ad.advertiser?.business_name}</strong>
                      {' · '}{ad.advertiser?.contact_email}
                      {ad.advertiser?.verified && <span style={{ marginLeft: 6, color: '#1A9E5F' }}>✓ verified</span>}
                    </div>
                  </div>
                  {ad.image_url && (
                    <img src={ad.image_url} alt="" style={{ width: 80, height: 60, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid #1E1E26' }} />
                  )}
                </div>

                {/* Metrics row */}
                <div style={{ display: 'flex', gap: 0, borderBottom: ad.status === 'pending_review' ? '1px solid #141418' : 'none' }}>
                  {[
                    { label: 'Budget', value: formatNaira(ad.budget_kobo) },
                    { label: 'Spent', value: formatNaira(ad.spent_kobo) },
                    { label: 'CPM', value: formatNaira(ad.cpm_kobo) },
                    { label: 'Impressions', value: formatNumber(ad.impressions) },
                    { label: 'Clicks', value: formatNumber(ad.clicks) },
                    { label: 'CTR', value: `${ctr}%` },
                  ].map((m, i, arr) => (
                    <div key={m.label} style={{ flex: 1, padding: '12px 16px', borderRight: i < arr.length - 1 ? '1px solid #141418' : 'none' }}>
                      <div style={{ fontSize: 11, color: '#44444A', marginBottom: 3, letterSpacing: '0.04em' }}>{m.label.toUpperCase()}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#D0D0C8', fontFamily: "'Syne', sans-serif" }}>{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* Review actions */}
                {ad.status === 'pending_review' && (
                  <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <a href={ad.destination_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#1A9E5F', textDecoration: 'none' }}>
                      Preview destination →
                    </a>
                    <div style={{ marginLeft: 'auto' }}>
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