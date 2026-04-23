// src/app/(admin)/admin/activity/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatRelativeTime } from '@/lib/utils'

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
    <div style={{ padding: '28px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em' }}>Activity log</h1>
        <p style={{ fontSize: 14, color: '#44444A', marginTop: 2 }}>{total} actions recorded</p>
      </div>

      <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, overflow: 'hidden' }}>
        {logs.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#44444A' }}>No activity yet</p>
          </div>
        ) : logs.map((log: any, i: number) => {
          const style = ACTION_STYLE[log.action] || { color: '#8A8A85', label: log.action }
          return (
            <div key={log.id} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '13px 20px',
              borderBottom: i < logs.length - 1 ? '1px solid #141418' : 'none',
            }}>
              {/* Action dot */}
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: style.color, flexShrink: 0 }} />

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#F0F0EC', fontFamily: "'Syne', sans-serif" }}>
                    {log.admin?.username || 'system'}
                  </span>
                  <span style={{ fontSize: 13, color: style.color, fontWeight: 500 }}>
                    {style.label}
                  </span>
                  {log.target_type && (
                    <span style={{ fontSize: 12, color: '#44444A' }}>
                      ({log.target_type} · {(log.target_id as string)?.slice(0, 8)}…)
                    </span>
                  )}
                </div>
                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <div style={{ fontSize: 12, color: '#44444A', marginTop: 3 }}>
                    {log.metadata.reason && `Reason: ${log.metadata.reason}`}
                    {log.metadata.notes && `Notes: ${log.metadata.notes}`}
                    {log.metadata.message && log.metadata.message}
                  </div>
                )}
              </div>

              <span style={{ fontSize: 12, color: '#3A3A40', flexShrink: 0 }}>
                {formatRelativeTime(log.created_at)}
              </span>
            </div>
          )
        })}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          {page > 1 && (
            <a href={`?page=${page - 1}`} style={{ padding: '8px 16px', background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 8, color: '#8A8A85', textDecoration: 'none', fontSize: 13 }}>
              ← Previous
            </a>
          )}
          <span style={{ padding: '8px 16px', fontSize: 13, color: '#44444A' }}>Page {page} of {totalPages}</span>
          {page < totalPages && (
            <a href={`?page=${page + 1}`} style={{ padding: '8px 16px', background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 8, color: '#8A8A85', textDecoration: 'none', fontSize: 13 }}>
              Next →
            </a>
          )}
        </div>
      )}
    </div>
  )
}