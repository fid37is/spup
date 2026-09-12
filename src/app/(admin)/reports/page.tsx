// src/app/(admin)/reports/page.tsx
import Link from 'next/link'
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

// Where an admin can actually go to look at the reported thing. Comments
// don't have a standalone view, so there's no link for those.
function entityHref(entityType: string, entityId: string): string | null {
  if (entityType === 'post') return `/post/${entityId}`
  if (entityType === 'user') return `/users/${entityId}`
  return null
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

  const reports = data || []

  // "Suspend user" needs the *author's* id, which is only the same as
  // entity_id when the report target is a user. For post reports, entity_id
  // is the post id — look up its author so the suspend action hits the
  // right account instead of silently matching nothing.
  const postIds = reports.filter((r: any) => r.entity_type === 'post').map((r: any) => r.entity_id)
  let postAuthors: Record<string, string> = {}
  if (postIds.length > 0) {
    const { data: authoredPosts } = await admin.from('posts').select('id, user_id').in('id', postIds)
    postAuthors = Object.fromEntries((authoredPosts || []).map((p: any) => [p.id, p.user_id]))
  }

  return reports.map((r: any) => ({
    ...r,
    targetUserId:
      r.entity_type === 'user' ? r.entity_id :
      r.entity_type === 'post' ? (postAuthors[r.entity_id] ?? null) :
      null,
  }))
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
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Reports</h1>
        <p className="mt-0.5 text-sm text-faint">User-submitted content reports</p>
      </div>

      {/* Status tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map(tab => (
          <Link
            key={tab.key}
            href={`?status=${tab.key}`}
            className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 font-display text-sm font-semibold no-underline sm:px-[18px]"
            style={{
              color: activeStatus === tab.key ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
              borderBottomColor: activeStatus === tab.key ? 'var(--color-brand)' : 'transparent',
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[11px] font-extrabold"
                style={{
                  background: tab.key === 'pending' ? 'var(--color-error)' : 'var(--color-surface-3)',
                  color: tab.key === 'pending' ? 'white' : 'var(--color-text-secondary)',
                }}
              >
                {tab.count}
              </span>
            )}
          </Link>
        ))}
      </div>

      {reports.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface px-5 py-16 text-center">
          <div className="mb-3 text-3xl">✓</div>
          <p className="text-[15px] text-faint">No {activeStatus} reports</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((r: any) => {
            const pill = STATUS_STYLE[r.status] || STATUS_STYLE.pending
            const href = entityHref(r.entity_type, r.entity_id)
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1">
                    {/* Header row */}
                    <div className="mb-2.5 flex flex-wrap items-center gap-2">
                      <span
                        className="rounded px-2 py-0.5 text-[11px] font-bold tracking-wide"
                        style={{ background: pill.bg, color: pill.color }}
                      >
                        {r.status.toUpperCase()}
                      </span>
                      <span className="font-display text-[13px] font-semibold text-[#D0D0C8]">
                        {REASON_LABEL[r.reason] || r.reason}
                      </span>
                      <span className="text-xs text-faint">on {r.entity_type}</span>
                      <span className="text-xs text-[#3A3A40]">·</span>
                      <span className="text-xs text-[#3A3A40]">{formatRelativeTime(r.created_at)}</span>
                    </div>

                    {/* Reporter */}
                    <div className="text-[13px] text-secondary">
                      Reported by{' '}
                      <Link href={`/users?q=${encodeURIComponent(r.reporter?.username || '')}`} className="font-semibold text-[#8A8A85] no-underline">
                        @{r.reporter?.username}
                      </Link>
                    </div>

                    {/* Details */}
                    {r.details && (
                      <div className="mt-2 rounded-lg bg-[color:var(--color-surface-2)] px-3.5 py-2.5 text-[13px] italic leading-relaxed text-[#9A9A90]">
                        &ldquo;{r.details}&rdquo;
                      </div>
                    )}

                    {/* Entity link */}
                    <div className="mt-2.5">
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-brand no-underline"
                        >
                          View {r.entity_type} →
                        </a>
                      ) : (
                        <span className="text-xs text-faint">No direct view available for this {r.entity_type}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {r.status === 'pending' && (
                    <div className="flex justify-end sm:justify-start">
                      <ReportActions reportId={r.id} entityType={r.entity_type} entityId={r.entity_id} targetUserId={r.targetUserId} />
                    </div>
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
