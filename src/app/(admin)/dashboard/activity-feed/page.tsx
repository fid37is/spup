// src/app/(admin)/admin/activity-feed/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatNaira, formatRelativeTime } from '@/lib/utils'
import { UserPlus, FileText, Wallet, Megaphone, Flag } from 'lucide-react'

interface FeedEvent {
  id: string
  type: 'signup' | 'post' | 'transaction' | 'promotion' | 'report'
  created_at: string
  actor: string
  detail: string
  color: string
  icon: React.ElementType
}

const LIMIT_PER_SOURCE = 20
const FEED_LIMIT = 60

async function getActivityFeed(): Promise<FeedEvent[]> {
  const admin = createAdminClient()

  const [{ data: signups }, { data: posts }, { data: txns }, { data: promos }, { data: reports }] = await Promise.all([
    admin.from('users').select('id, username, display_name, created_at').order('created_at', { ascending: false }).limit(LIMIT_PER_SOURCE),
    admin.from('posts').select('id, body, created_at, author:users!posts_user_id_fkey(username)').is('deleted_at', null).order('created_at', { ascending: false }).limit(LIMIT_PER_SOURCE),
    admin.from('transactions').select('id, type, amount_kobo, status, created_at, wallet:wallets(user:users(username))').eq('status', 'completed').order('created_at', { ascending: false }).limit(LIMIT_PER_SOURCE),
    admin.from('post_promotions').select('id, tier, price_kobo, status, created_at, user:users(username)').order('created_at', { ascending: false }).limit(LIMIT_PER_SOURCE),
    admin.from('reports').select('id, reason, entity_type, created_at, reporter:users!reports_reporter_id_fkey(username)').order('created_at', { ascending: false }).limit(LIMIT_PER_SOURCE),
  ])

  const events: FeedEvent[] = []

  for (const u of (signups || []) as any[]) {
    events.push({ id: `signup-${u.id}`, type: 'signup', created_at: u.created_at, actor: `@${u.username}`, detail: `joined Spup as ${u.display_name}`, color: '#378ADD', icon: UserPlus })
  }
  for (const p of (posts || []) as any[]) {
    events.push({ id: `post-${p.id}`, type: 'post', created_at: p.created_at, actor: `@${p.author?.username || 'unknown'}`, detail: `posted: "${(p.body || '').slice(0, 60)}${(p.body || '').length > 60 ? '…' : ''}"`, color: '#8A8A85', icon: FileText })
  }
  for (const t of (txns || []) as any[]) {
    const label = t.type.replace(/_/g, ' ')
    events.push({ id: `txn-${t.id}`, type: 'transaction', created_at: t.created_at, actor: `@${t.wallet?.user?.username || 'unknown'}`, detail: `${label} · ${formatNaira(t.amount_kobo)}`, color: '#1A9E5F', icon: Wallet })
  }
  for (const pr of (promos || []) as any[]) {
    events.push({ id: `promo-${pr.id}`, type: 'promotion', created_at: pr.created_at, actor: `@${pr.user?.username || 'unknown'}`, detail: `${pr.status === 'active' ? 'boosted a post' : `promotion ${pr.status}`} (${pr.tier}, ${formatNaira(pr.price_kobo)})`, color: '#D4A017', icon: Megaphone })
  }
  for (const r of (reports || []) as any[]) {
    events.push({ id: `report-${r.id}`, type: 'report', created_at: r.created_at, actor: `@${r.reporter?.username || 'unknown'}`, detail: `reported a ${r.entity_type} for ${r.reason.replace(/_/g, ' ')}`, color: '#E53935', icon: Flag })
  }

  return events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, FEED_LIMIT)
}

const FILTERS = [
  { key: 'all',         label: 'All' },
  { key: 'signup',      label: 'Signups' },
  { key: 'post',        label: 'Posts' },
  { key: 'transaction', label: 'Payments' },
  { key: 'promotion',   label: 'Promotions' },
  { key: 'report',      label: 'Reports' },
]

export default async function AdminActivityFeedPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const params = await searchParams
  const activeType = params.type || 'all'
  const events = await getActivityFeed()
  const filtered = activeType === 'all' ? events : events.filter(e => e.type === activeType)

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em' }}>Live activity</h1>
          <p style={{ fontSize: 14, color: '#44444A', marginTop: 2 }}>Real-time platform activity - signups, posts, payments, and reports</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#44444A' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1A9E5F' }} />
          Auto-refresh on reload
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #1E1E26', overflowX: 'auto' }}>
        {FILTERS.map(f => (
          <a
            key={f.key}
            href={`?type=${f.key}`}
            style={{
              padding: '10px 16px', textDecoration: 'none', fontSize: 13, whiteSpace: 'nowrap',
              fontFamily: "'Syne', sans-serif", fontWeight: 600,
              color: activeType === f.key ? '#F0F0EC' : '#44444A',
              borderBottom: activeType === f.key ? '2px solid #1A9E5F' : '2px solid transparent',
            }}
          >
            {f.label}
          </a>
        ))}
      </div>

      <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#44444A' }}>No activity yet</p>
          </div>
        ) : filtered.map((e, i) => {
          const Icon = e.icon
          return (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < filtered.length - 1 ? '1px solid #141418' : 'none' }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: `${e.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={14} color={e.color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#F0F0EC', fontFamily: "'Syne', sans-serif", marginRight: 6 }}>{e.actor}</span>
                <span style={{ fontSize: 13, color: '#8A8A85' }}>{e.detail}</span>
              </div>
              <span style={{ fontSize: 12, color: '#3A3A40', flexShrink: 0 }}>{formatRelativeTime(e.created_at)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}