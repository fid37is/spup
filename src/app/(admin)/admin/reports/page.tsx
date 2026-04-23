// src/app/(admin)/admin/reports/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatRelativeTime } from '@/lib/utils'
import ReportActions from './report-actions'

interface SearchParams { status?: string }

const REASON_LABEL: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  hate_speech: 'Hate speech',
  misinformation: 'Misinformation',
  nudity: 'Nudity',
  violence: 'Violence',
  other: 'Other',
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:   { bg: 'rgba(212,160,23,0.12)',  color: '#D4A017' },
  reviewed:  { bg: 'rgba(55,138,221,0.12)',  color: '#378ADD' },
  actioned:  { bg: 'rgba(229,57,53,0.12)',   color: '#E53935' },
  dismissed: { bg: 'rgba(100,100,100,0.12)', color: '#555' },
}

async function getReports(params: SearchParams) {
  const admin = createAdminClient()
  const status = params.status || 'pending'

  const { data } = await admin
    .from('reports')
    .select(`
      id, entity_type, entity_id, reason, details, status, created_at,
      reporter:users!reports_reporter_id_fkey(id, username, display_name),
      reviewer:users!reports_reviewer_id_fkey(username)
    `)
    .eq('status', status)
    .order('created_at', { ascending: true })
    .limit(50)

  return data || []
}

async function getReportCounts() {
  const admin = createAdminClient()
  const statuses = ['pending', 'actioned', 'dismissed']
  const counts: Record<string, number> = {}

  await Promise.all(statuses.map(async s => {
    const { count } = await admin
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', s)
    counts[s] = count || 0
  }))

  return counts
}

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const [reports, counts] = await Promise.all([getReports(params), getReportCounts()])
  const activeStatus = params.status || 'pending'

  const TABS = [
    { key: 'pending',   label: 'Pending',   count: counts.pending },
    { key: 'actioned',  label: 'Actioned',  count: counts.actioned },
    { key: 'dismissed', label: 'Dismissed', count: counts.dismissed },
  ]

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em' }}>Reports</h1>
        <p style={{ fontSize: 14, color: '#44444A', marginTop: 2 }}>User-submitted content reports</p>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #1E1E26', paddingBottom: 0 }}>
        {TABS.map(tab => (
          <a
            key={tab.key}
            href={`?status=${tab.key}`}
            style={{
              padding: '10px 18px', textDecoration: 'none', fontSize: 14,
              fontFamily: "'Syne', sans-serif", fontWeight: 600,
              color: activeStatus === tab.key ? '#F0F0EC' : '#44444A',
              borderBottom: activeStatus === tab.key ? '2px solid #1A9E5F' : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                background: tab.key === 'pending' && tab.count > 0 ? '#E53935' : '#1E1E26',
                color: tab.key === 'pending' && tab.count > 0 ? 'white' : '#6A6A60',
                fontSize: 11, fontWeight: 800, borderRadius: 10, padding: '1px 7px',
              }}>
                {tab.count}
              </span>
            )}
          </a>
        ))}
      </div>

      {reports.length === 0 ? (
        <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <p style={{ fontSize: 15, color: '#44444A' }}>No {activeStatus} reports</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reports.map((r: any) => {
            const pill = STATUS_STYLE[r.status] || STATUS_STYLE.pending
            return (
              <div key={r.id} style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', background: pill.bg, color: pill.color, padding: '2px 8px', borderRadius: 5 }}>
                        {r.status.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#D0D0C8', fontFamily: "'Syne', sans-serif" }}>
                        {REASON_LABEL[r.reason] || r.reason}
                      </span>
                      <span style={{ fontSize: 12, color: '#44444A' }}>on {r.entity_type}</span>
                      <span style={{ fontSize: 12, color: '#3A3A40' }}>·</span>
                      <span style={{ fontSize: 12, color: '#3A3A40' }}>{formatRelativeTime(r.created_at)}</span>
                    </div>

                    {/* Reporter */}
                    <div style={{ fontSize: 13, color: '#6A6A60', marginBottom: r.details ? 8 : 0 }}>
                      Reported by{' '}
                      <a href={`/admin/users?q=${r.reporter?.username}`} style={{ color: '#8A8A85', textDecoration: 'none', fontWeight: 600 }}>
                        @{r.reporter?.username}
                      </a>
                    </div>

                    {/* Details */}
                    {r.details && (
                      <div style={{ fontSize: 13, color: '#9A9A90', background: '#131318', borderRadius: 8, padding: '10px 14px', marginTop: 8, fontStyle: 'italic', lineHeight: 1.5 }}>
                        &ldquo;{r.details}&rdquo;
                      </div>
                    )}

                    {/* Entity link */}
                    <div style={{ marginTop: 10 }}>
                      <a
                        href={r.entity_type === 'post' ? `/post/${r.entity_id}` : `/admin/users?q=${r.entity_id}`}
                        target="_blank"
                        style={{ fontSize: 12, color: '#1A9E5F', textDecoration: 'none', fontWeight: 500 }}
                      >
                        View {r.entity_type} →
                      </a>
                    </div>
                  </div>

                  {/* Actions */}
                  {r.status === 'pending' && (
                    <ReportActions reportId={r.id} entityType={r.entity_type} entityId={r.entity_id} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}