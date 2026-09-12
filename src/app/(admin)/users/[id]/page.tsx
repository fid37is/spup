// src/app/(admin)/users/[id]/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="border-b border-[#141418] px-4 py-3">
        <h2 className="font-display text-sm font-bold text-primary">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="px-4 py-7 text-center">
      <p className="text-[13px] text-faint">{label}</p>
    </div>
  )
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getUserDetail(id)
  if (!data) notFound()

  const { user, posts, postCount, reports, wallet, auditLogs } = data

  const STATUS_COLOR: Record<string, string> = { active: '#1A9E5F', suspended: '#D4A017', banned: '#E53935', pending_verification: '#378ADD' }
  const statusColor = STATUS_COLOR[user.status] || '#555'

  const stats = [
    { label: 'Followers', value: formatNumber(user.followers_count) },
    { label: 'Following', value: formatNumber(user.following_count) },
    { label: 'Posts', value: formatNumber(user.posts_count) },
    { label: 'Wallet balance', value: wallet ? formatNaira(wallet.balance_kobo) : '—' },
    { label: 'Total earned', value: wallet ? formatNaira(wallet.total_earned_kobo) : '—' },
  ]

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      {/* Breadcrumb */}
      <div className="mb-5">
        <Link href="/users" className="text-[13px] text-faint no-underline">← Back to users</Link>
      </div>

      {/* Profile header */}
      <div className="mb-5 flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-start">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-brand font-display text-xl font-extrabold text-white sm:h-16 sm:w-16 sm:text-2xl">
            {user.display_name?.slice(0, 2).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1 sm:hidden">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h1 className="font-display text-lg font-extrabold tracking-tight text-primary">{user.display_name}</h1>
            </div>
            <div className="mb-2 text-sm text-secondary">@{user.username}</div>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 hidden flex-wrap items-center gap-3 sm:flex">
            <h1 className="font-display text-[22px] font-extrabold tracking-tight text-primary">{user.display_name}</h1>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className="rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide"
              style={{ background: `${statusColor}18`, color: statusColor }}
            >
              {user.status?.toUpperCase()}
            </span>
            <span className="rounded-md bg-[color:var(--color-surface-3)] px-2 py-0.5 text-[11px] capitalize text-faint">
              {user.role}
            </span>
            {user.is_monetised && (
              <span className="rounded-md bg-gold px-2 py-0.5 text-[11px] font-extrabold text-black">PRO</span>
            )}
            {user.bvn_verified && (
              <span className="rounded-md bg-brand-muted px-2 py-0.5 text-[11px] font-semibold text-brand">BVN ✓</span>
            )}
          </div>
          <div className="mb-2 hidden text-sm text-secondary sm:block">@{user.username}</div>
          <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-faint">
            {user.phone_number && <span>📱 {user.phone_number}</span>}
            {user.email && <span className="break-all">✉ {user.email}</span>}
            <span>Joined {formatRelativeTime(user.created_at)}</span>
            {user.last_active_at && <span>Last active {formatRelativeTime(user.last_active_at)}</span>}
          </div>
          {user.bio && <p className="text-sm leading-relaxed text-secondary">{user.bio}</p>}
        </div>

        <div className="flex justify-end sm:justify-start">
          <AdminUserActions userId={user.id} currentStatus={user.status} currentRole={user.role} />
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
        {stats.map(s => (
          <div key={s.label} className="rounded-[10px] border border-border bg-surface px-3.5 py-3">
            <div className="mb-1 text-[11px] tracking-wide text-faint">{s.label.toUpperCase()}</div>
            <div className="font-display text-base font-bold text-primary sm:text-lg">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Recent posts */}
        <Panel title={`Recent posts (${formatNumber(postCount)})`}>
          {posts.length === 0
            ? <EmptyRow label="No posts" />
            : posts.map((p: any, i: number) => (
              <div key={p.id} className={i < posts.length - 1 ? 'border-b border-[#141418] px-4 py-2.5' : 'px-4 py-2.5'}>
                <p className="line-clamp-2 text-[13px] leading-snug text-[#C0C0B8]">
                  {p.body || <em className="text-faint">[media]</em>}
                </p>
                <div className="mt-1 text-[11px] text-[#3A3A40]">
                  ♡ {p.likes_count} · {formatRelativeTime(p.created_at)}
                </div>
              </div>
            ))
          }
        </Panel>

        {/* Reports filed */}
        <Panel title="Reports filed">
          {reports.length === 0
            ? <EmptyRow label="No reports" />
            : reports.map((r: any, i: number) => (
              <div key={r.id} className={i < reports.length - 1 ? 'border-b border-[#141418] px-4 py-2.5' : 'px-4 py-2.5'}>
                <div className="text-[13px] font-medium text-[#C0C0B8]">{r.reason?.replace(/_/g, ' ')}</div>
                <div className="mt-0.5 text-[11px] text-[#3A3A40]">{r.entity_type} · {r.status} · {formatRelativeTime(r.created_at)}</div>
              </div>
            ))
          }
        </Panel>

        {/* Admin history */}
        <Panel title="Admin history">
          {auditLogs.length === 0
            ? <EmptyRow label="No admin actions" />
            : auditLogs.map((log: any, i: number) => (
              <div key={i} className={i < auditLogs.length - 1 ? 'border-b border-[#141418] px-4 py-2.5' : 'px-4 py-2.5'}>
                <div className="text-[13px] text-[#C0C0B8]">{log.action?.replace(/_/g, ' ')}</div>
                <div className="mt-0.5 text-[11px] text-[#3A3A40]">by @{log.admin?.username} · {formatRelativeTime(log.created_at)}</div>
              </div>
            ))
          }
        </Panel>
      </div>
    </div>
  )
}
