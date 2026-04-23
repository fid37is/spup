// src/app/(admin)/admin/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatNaira, formatNumber } from '@/lib/utils'
import { Users, FileText, Flag, DollarSign, TrendingUp, UserCheck, Clock, Megaphone } from 'lucide-react'

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

function StatCard({ icon: Icon, label, value, sub, color = '#1A9E5F', danger = false }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: string; danger?: boolean
}) {
  return (
    <div style={{
      background: '#0D0D12', border: `1px solid ${danger ? 'rgba(229,57,53,0.2)' : '#1E1E26'}`,
      borderRadius: 14, padding: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#6A6A60', fontWeight: 500, letterSpacing: '0.04em' }}>{label}</div>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: danger ? 'rgba(229,57,53,0.1)' : `${color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} color={danger ? '#E53935' : color} />
        </div>
      </div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 28, color: '#F0F0EC', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: danger ? '#E53935' : '#44444A', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  active: '#1A9E5F', suspended: '#D4A017', banned: '#E53935', pending_verification: '#378ADD',
}

export default async function AdminDashboard() {
  const stats = await getPlatformStats()

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 26, color: '#F0F0EC', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Dashboard
        </h1>
        <p style={{ fontSize: 14, color: '#44444A' }}>
          {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 32 }}>
        <StatCard icon={Users} label="Total users" value={formatNumber(stats.totalUsers)} sub={`+${stats.newUsersToday} today`} />
        <StatCard icon={FileText} label="Total posts" value={formatNumber(stats.totalPosts)} sub={`+${stats.postsToday} today`} />
        <StatCard icon={Clock} label="Waitlist" value={formatNumber(stats.waitlistCount)} sub="Awaiting invite" color="#D4A017" />
        <StatCard icon={Flag} label="Pending reports" value={String(stats.pendingReports)} sub="Needs review" danger={stats.pendingReports > 10} />
        <StatCard icon={Megaphone} label="Active ads" value={String(stats.activeAds)} sub="Running campaigns" color="#378ADD" />
        <StatCard icon={DollarSign} label="Platform revenue" value={formatNaira(stats.monthlyPlatformRevenue)} sub="This month (30%)" color="#D4A017" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Recent signups */}
        <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1A1A20', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: '#F0F0EC' }}>Recent signups</h2>
            <a href="/admin/users" style={{ fontSize: 13, color: '#1A9E5F', textDecoration: 'none', fontWeight: 600 }}>View all</a>
          </div>
          {stats.recentUsers.map((u: any, i: number) => (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 20px', borderBottom: i < stats.recentUsers.length - 1 ? '1px solid #141418' : 'none',
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: '#1A7A4A', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontFamily: "'Syne', sans-serif",
                fontWeight: 800, fontSize: 13, color: 'white',
              }}>
                {u.display_name?.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#F0F0EC', fontFamily: "'Syne', sans-serif" }}>{u.display_name}</div>
                <div style={{ fontSize: 11, color: '#44444A' }}>@{u.username}</div>
              </div>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                color: STATUS_COLORS[u.status] || '#555',
                background: `${STATUS_COLORS[u.status] || '#555'}15`,
                padding: '2px 7px', borderRadius: 4,
              }}>
                {u.status?.toUpperCase()}
              </div>
            </div>
          ))}
        </div>

        {/* Pending reports */}
        <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1A1A20', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: '#F0F0EC' }}>
              Pending reports
              {stats.pendingReports > 0 && (
                <span style={{ marginLeft: 8, background: '#E53935', color: 'white', fontSize: 11, fontWeight: 800, borderRadius: 10, padding: '1px 7px' }}>
                  {stats.pendingReports}
                </span>
              )}
            </h2>
            <a href="/admin/reports" style={{ fontSize: 13, color: '#1A9E5F', textDecoration: 'none', fontWeight: 600 }}>View all</a>
          </div>
          {stats.recentReports.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: '#44444A' }}>No pending reports</p>
            </div>
          ) : stats.recentReports.map((r: any, i: number) => (
            <div key={r.id} style={{
              padding: '12px 20px', borderBottom: i < stats.recentReports.length - 1 ? '1px solid #141418' : 'none',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 13, color: '#D0D0C8', fontWeight: 500 }}>
                  {r.reason?.replace(/_/g, ' ')}
                  <span style={{ marginLeft: 6, fontSize: 11, color: '#44444A' }}>({r.entity_type})</span>
                </div>
                <div style={{ fontSize: 11, color: '#44444A', marginTop: 2 }}>
                  by @{r.reporter?.username} · {new Date(r.created_at).toLocaleDateString('en-NG')}
                </div>
              </div>
              <a href={`/admin/reports/${r.id}`} style={{
                fontSize: 12, color: '#F0F0EC', background: '#1E1E26',
                padding: '5px 12px', borderRadius: 8, textDecoration: 'none', fontWeight: 600,
              }}>
                Review
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}