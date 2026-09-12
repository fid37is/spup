// src/app/(admin)/activity/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatRelativeTime } from '@/lib/utils'
import { AdminPagination } from '@/components/admin/pagination'

const ACTION_STYLE: Record<string, { color: string; label: string }> = {
  ban:                  { color: '#E53935', label: 'Banned user' },
  unban:                { color: '#1A9E5F', label: 'Unbanned user' },
  suspend:              { color: '#D4A017', label: 'Suspended user' },
  unsuspend:            { color: '#1A9E5F', label: 'Lifted suspension' },
  make_moderator:       { color: '#378ADD', label: 'Promoted to moderator' },
  revoke_moderator:     { color: '#D4A017', label: 'Revoked moderator' },
  delete_post:          { color: '#E53935', label: 'Removed post' },
  report_dismiss:       { color: '#555',    label: 'Dismissed report' },
  report_action_taken:  { color: '#D4A017', label: 'Actioned report' },
  ad_active:            { color: '#1A9E5F', label: 'Approved ad' },
  ad_rejected:          { color: '#E53935', label: 'Rejected ad' },
  waitlist_invite:      { color: '#378ADD', label: 'Invited from waitlist' },
  approve_monetisation: { color: '#1A9E5F', label: 'Approved monetisation' },
}

async function getActivityLog(page = 1) {
  const admin = createAdminClient()
  const limit = 40
  const from = (page - 1) * limit

  const { data, count } = await admin
    .from('admin_audit_log')
    .select(`
      id, action, target_type, target_id, metadata, created_at,
      admin:users!admin_audit_log_admin_id_fkey(username, display_name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  return { logs: data || [], total: count || 0, page, limit }
}

export default async function AdminActivityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams
  const { logs, total, page, limit } = await getActivityLog(parseInt(params.page || '1'))
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Activity log</h1>
        <p className="mt-0.5 text-sm text-faint">{total} actions recorded</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {logs.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-sm text-faint">No activity yet</p>
          </div>
        ) : logs.map((log: any, i: number) => {
          const style = ACTION_STYLE[log.action] || { color: '#8A8A85', label: log.action }
          return (
            <div
              key={log.id}
              className={`flex items-start gap-3 px-4 py-3.5 sm:items-center sm:gap-4 sm:px-5 ${i < logs.length - 1 ? 'border-b border-[#141418]' : ''}`}
            >
              {/* Action dot */}
              <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full sm:mt-0" style={{ background: style.color }} />

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-[13px] font-semibold text-primary">
                    {log.admin?.username || 'system'}
                  </span>
                  <span className="text-[13px] font-medium" style={{ color: style.color }}>
                    {style.label}
                  </span>
                  {log.target_type && (
                    <span className="text-xs text-faint">
                      ({log.target_type} · {(log.target_id as string)?.slice(0, 8)}…)
                    </span>
                  )}
                </div>
                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <div className="mt-0.5 text-xs text-faint">
                    {log.metadata.reason && `Reason: ${log.metadata.reason}`}
                    {log.metadata.notes && `Notes: ${log.metadata.notes}`}
                    {log.metadata.message && log.metadata.message}
                  </div>
                )}
              </div>

              <span className="flex-shrink-0 text-xs text-[#3A3A40]">
                {formatRelativeTime(log.created_at)}
              </span>
            </div>
          )
        })}
      </div>

      <AdminPagination page={page} totalPages={totalPages} basePath="/activity" />
    </div>
  )
}
