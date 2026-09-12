// src/app/(admin)/dashboard/page.tsx
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { formatNaira, formatNumber } from '@/lib/utils'
import { Users, FileText, Flag, DollarSign, Clock, Megaphone } from 'lucide-react'
import { StatCard } from '@/components/admin/stat-card'

async function getPlatformStats() {
  const admin = createAdminClient()
  const now = new Date()
  const startOfDay = new Date(now.setHours(0, 0, 0, 0)).toISOString()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [
    { count: totalUsers },
    { count: newUsersToday },
    { count: totalPosts },
    { count: postsToday },
    { count: pendingReports },
    { count: activeAds },
    { count: waitlistCount },
    { data: earningsData },
    { data: recentUsers },
    { data: recentReports },
  ] = await Promise.all([
    admin.from('users').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    admin.from('users').select('id', { count: 'exact', head: true }).gte('created_at', startOfDay),
    admin.from('posts').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    admin.from('posts').select('id', { count: 'exact', head: true }).gte('created_at', startOfDay),
    admin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('ads').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('waitlist').select('id', { count: 'exact', head: true }),
    admin.from('transactions').select('amount_kobo').eq('status', 'completed').gte('created_at', startOfMonth),
    admin.from('users').select('id, display_name, username, created_at, status, role').order('created_at', { ascending: false }).limit(6),
    admin.from('reports').select('id, entity_type, reason, status, created_at, reporter:users!reports_reporter_id_fkey(username)').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
  ])

  const monthlyPlatformRevenue = (earningsData || []).reduce((sum: number, t: { amount_kobo: number }) => sum + t.amount_kobo, 0) * 0.3

  return {
    totalUsers: totalUsers || 0,
    newUsersToday: newUsersToday || 0,
    totalPosts: totalPosts || 0,
    postsToday: postsToday || 0,
    pendingReports: pendingReports || 0,
    activeAds: activeAds || 0,
    waitlistCount: waitlistCount || 0,
    monthlyPlatformRevenue,
    recentUsers: recentUsers || [],
    recentReports: recentReports || [],
  }
}

const STATUS_COLORS: Record<string, string> = {
  active: '#1A9E5F', suspended: '#D4A017', banned: '#E53935', pending_verification: '#378ADD',
}

export default async function AdminDashboard() {
  const stats = await getPlatformStats()

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      {/* Header */}
      <div className="mb-6 sm:mb-7">
        <h1 className="mb-1 font-display text-2xl font-extrabold tracking-tight text-primary sm:text-[26px]">
          Dashboard
        </h1>
        <p className="text-sm text-faint">
          {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Stats grid */}
      <div className="mb-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 xl:grid-cols-6">
        <StatCard icon={Users} label="Total users" value={formatNumber(stats.totalUsers)} sub={`+${stats.newUsersToday} today`} />
        <StatCard icon={FileText} label="Total posts" value={formatNumber(stats.totalPosts)} sub={`+${stats.postsToday} today`} />
        <StatCard icon={Clock} label="Waitlist" value={formatNumber(stats.waitlistCount)} sub="Awaiting invite" color="#D4A017" />
        <StatCard icon={Flag} label="Pending reports" value={String(stats.pendingReports)} sub="Needs review" danger={stats.pendingReports > 10} />
        <StatCard icon={Megaphone} label="Active ads" value={String(stats.activeAds)} sub="Running campaigns" color="#378ADD" />
        <StatCard icon={DollarSign} label="Platform revenue" value={formatNaira(stats.monthlyPlatformRevenue)} sub="This month (30%)" color="#D4A017" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        {/* Recent signups */}
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-[#1A1A20] px-4 py-3.5 sm:px-5">
            <h2 className="font-display text-[15px] font-bold text-primary">Recent signups</h2>
            <Link href="/users" className="text-[13px] font-semibold text-brand no-underline">View all</Link>
          </div>
          {stats.recentUsers.map((u: any, i: number) => (
            <div
              key={u.id}
              className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${i < stats.recentUsers.length - 1 ? 'border-b border-[#141418]' : ''}`}
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#1A7A4A] font-display text-xs font-extrabold text-white">
                {u.display_name?.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[13px] font-semibold text-primary">{u.display_name}</div>
                <div className="text-[11px] text-faint">@{u.username}</div>
              </div>
              <div
                className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide"
                style={{ color: STATUS_COLORS[u.status] || '#555', background: `${STATUS_COLORS[u.status] || '#555'}15` }}
              >
                {u.status?.toUpperCase()}
              </div>
            </div>
          ))}
        </div>

        {/* Pending reports */}
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-[#1A1A20] px-4 py-3.5 sm:px-5">
            <h2 className="font-display text-[15px] font-bold text-primary">
              Pending reports
              {stats.pendingReports > 0 && (
                <span className="ml-2 rounded-full bg-error px-1.5 py-0.5 text-[11px] font-extrabold text-white">
                  {stats.pendingReports}
                </span>
              )}
            </h2>
            <Link href="/reports" className="text-[13px] font-semibold text-brand no-underline">View all</Link>
          </div>
          {stats.recentReports.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-faint">No pending reports</p>
            </div>
          ) : stats.recentReports.map((r: any, i: number) => (
            <div
              key={r.id}
              className={`flex items-center justify-between gap-3 px-4 py-3 sm:px-5 ${i < stats.recentReports.length - 1 ? 'border-b border-[#141418]' : ''}`}
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-[#D0D0C8]">
                  {r.reason?.replace(/_/g, ' ')}
                  <span className="ml-1.5 text-[11px] text-faint">({r.entity_type})</span>
                </div>
                <div className="mt-0.5 text-[11px] text-faint">
                  by @{r.reporter?.username} · {new Date(r.created_at).toLocaleDateString('en-NG')}
                </div>
              </div>
              {/* There's no single-report detail route — send admins to the
                  reports list, where each report can be resolved inline. */}
              <Link
                href="/reports"
                className="flex-shrink-0 rounded-lg bg-[color:var(--color-surface-3)] px-3 py-1.5 text-xs font-semibold text-primary no-underline"
              >
                Review
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
