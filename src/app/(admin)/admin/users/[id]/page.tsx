// src/app/(admin)/admin/users/[id]/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { formatNaira, formatNumber, formatRelativeTime } from '@/lib/utils'
import AdminUserActions from '../user-actions'

async function getUserDetail(userId: string) {
  const admin = createAdminClient()

  const [
    { data: user },
    { data: posts, count: postCount },
    { data: reports },
    { data: wallet },
    { data: auditLogs },
  ] = await Promise.all([
    admin.from('users').select('*').eq('id', userId).single(),
    admin.from('posts').select('id, body, likes_count, created_at', { count: 'exact' })
      .eq('user_id', userId).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(5),
    admin.from('reports').select('id, reason, status, entity_type, created_at')
      .eq('reporter_id', userId).order('created_at', { ascending: false }).limit(10),
    admin.from('wallets').select('*').eq('user_id', userId).single(),
    admin.from('admin_audit_log').select(`
      action, created_at, metadata,
      admin:users!admin_audit_log_admin_id_fkey(username)
    `).eq('target_id', userId).order('created_at', { ascending: false }).limit(10),
  ])

  if (!user) return null
  return { user, posts: posts || [], postCount: postCount || 0, reports: reports || [], wallet: wallet || null, auditLogs: auditLogs || [] }
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getUserDetail(id)
  if (!data) notFound()

  const { user, posts, postCount, reports, wallet, auditLogs } = data

  const STATUS_COLOR: Record<string, string> = { active: '#1A9E5F', suspended: '#D4A017', banned: '#E53935', pending_verification: '#378ADD' }
  const statusColor = STATUS_COLOR[user.status] || '#555'

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <a href="/admin/users" style={{ fontSize: 13, color: '#44444A', textDecoration: 'none' }}>← Back to users</a>
      </div>

      {/* Profile header */}
      <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 16, padding: '24px', marginBottom: 20, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: '#1A9E5F', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: 'white',
        }}>
          {user.display_name?.slice(0, 2).toUpperCase()}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: '#F0F0EC', letterSpacing: '-0.01em' }}>
              {user.display_name}
            </h1>
            <span style={{ fontSize: 11, fontWeight: 700, background: `${statusColor}18`, color: statusColor, padding: '2px 9px', borderRadius: 6, letterSpacing: '0.05em' }}>
              {user.status?.toUpperCase()}
            </span>
            <span style={{ fontSize: 11, color: '#44444A', background: '#1A1A20', padding: '2px 8px', borderRadius: 6, textTransform: 'capitalize' }}>
              {user.role}
            </span>
            {user.is_monetised && <span style={{ fontSize: 11, background: '#D4A017', color: '#000', padding: '2px 8px', borderRadius: 6, fontWeight: 800 }}>PRO</span>}
            {user.bvn_verified && <span style={{ fontSize: 11, background: 'rgba(26,158,95,0.12)', color: '#1A9E5F', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>BVN ✓</span>}
          </div>
          <div style={{ fontSize: 14, color: '#6A6A60', marginBottom: 4 }}>@{user.username}</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, color: '#44444A', marginBottom: 12 }}>
            {user.phone_number && <span>📱 {user.phone_number}</span>}
            {user.email && <span>✉ {user.email}</span>}
            <span>Joined {formatRelativeTime(user.created_at)}</span>
            {user.last_active_at && <span>Last active {formatRelativeTime(user.last_active_at)}</span>}
          </div>
          {user.bio && <p style={{ fontSize: 14, color: '#8A8A85', lineHeight: 1.5 }}>{user.bio}</p>}
        </div>

        <AdminUserActions userId={user.id} currentStatus={user.status} currentRole={user.role} />
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Followers', value: formatNumber(user.followers_count) },
          { label: 'Following', value: formatNumber(user.following_count) },
          { label: 'Posts', value: formatNumber(user.posts_count) },
          { label: 'Wallet balance', value: wallet ? formatNaira(wallet.balance_kobo) : '—' },
          { label: 'Total earned', value: wallet ? formatNaira(wallet.total_earned_kobo) : '—' },
        ].map(s => (
          <div key={s.label} style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: '#44444A', marginBottom: 4, letterSpacing: '0.04em' }}>{s.label.toUpperCase()}</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: '#F0F0EC' }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {/* Recent posts */}
        <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid #141418' }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: '#F0F0EC' }}>
              Recent posts ({formatNumber(postCount)})
            </h2>
          </div>
          {posts.length === 0
            ? <div style={{ padding: '28px 16px', textAlign: 'center' }}><p style={{ fontSize: 13, color: '#44444A' }}>No posts</p></div>
            : posts.map((p: any, i: number) => (
              <div key={p.id} style={{ padding: '11px 16px', borderBottom: i < posts.length - 1 ? '1px solid #141418' : 'none' }}>
                <p style={{ fontSize: 13, color: '#C0C0B8', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, lineHeight: 1.4 }}>
                  {p.body || <em style={{ color: '#44444A' }}>[media]</em>}
                </p>
                <div style={{ fontSize: 11, color: '#3A3A40', marginTop: 4 }}>
                  ♡ {p.likes_count} · {formatRelativeTime(p.created_at)}
                </div>
              </div>
            ))
          }
        </div>

        {/* Reports filed */}
        <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid #141418' }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: '#F0F0EC' }}>Reports filed</h2>
          </div>
          {reports.length === 0
            ? <div style={{ padding: '28px 16px', textAlign: 'center' }}><p style={{ fontSize: 13, color: '#44444A' }}>No reports</p></div>
            : reports.map((r: any, i: number) => (
              <div key={r.id} style={{ padding: '11px 16px', borderBottom: i < reports.length - 1 ? '1px solid #141418' : 'none' }}>
                <div style={{ fontSize: 13, color: '#C0C0B8', fontWeight: 500 }}>{r.reason?.replace(/_/g, ' ')}</div>
                <div style={{ fontSize: 11, color: '#3A3A40', marginTop: 2 }}>{r.entity_type} · {r.status} · {formatRelativeTime(r.created_at)}</div>
              </div>
            ))
          }
        </div>

        {/* Admin history */}
        <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid #141418' }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: '#F0F0EC' }}>Admin history</h2>
          </div>
          {auditLogs.length === 0
            ? <div style={{ padding: '28px 16px', textAlign: 'center' }}><p style={{ fontSize: 13, color: '#44444A' }}>No admin actions</p></div>
            : auditLogs.map((log: any, i: number) => (
              <div key={i} style={{ padding: '11px 16px', borderBottom: i < auditLogs.length - 1 ? '1px solid #141418' : 'none' }}>
                <div style={{ fontSize: 13, color: '#C0C0B8' }}>{log.action?.replace(/_/g, ' ')}</div>
                <div style={{ fontSize: 11, color: '#3A3A40', marginTop: 2 }}>by @{log.admin?.username} · {formatRelativeTime(log.created_at)}</div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}