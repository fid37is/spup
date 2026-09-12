// src/app/(admin)/activity-feed/page.tsx
import Link from 'next/link'
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
    admin.from('posts').select('id, body, post_type, created_at, author:users!posts_user_id_fkey(username)').is('deleted_at', null).order('created_at', { ascending: false }).limit(LIMIT_PER_SOURCE),
    admin.from('transactions').select('id, type, amount_kobo, status, created_at, wallet:wallets(user:users(username))').eq('status', 'completed').order('created_at', { ascending: false }).limit(LIMIT_PER_SOURCE),
    admin.from('post_promotions').select('id, tier, price_kobo, status, created_at, user:users(username)').order('created_at', { ascending: false }).limit(LIMIT_PER_SOURCE),
    admin.from('reports').select('id, reason, entity_type, created_at, reporter:users!reports_reporter_id_fkey(username)').order('created_at', { ascending: false }).limit(LIMIT_PER_SOURCE),
  ])

  const events: FeedEvent[] = []

  for (const u of (signups || []) as any[]) {
    events.push({ id: `signup-${u.id}`, type: 'signup', created_at: u.created_at, actor: `@${u.username}`, detail: `joined Spup as ${u.display_name}`, color: '#378ADD', icon: UserPlus })
  }
  for (const p of (posts || []) as any[]) {
    // Reposts intentionally carry no body text (they're a pointer to the
    // original post via quoted_post_id) — rendering them through the same
    // `posted: "..."` template as original posts made every repost look
    // like an empty post in this feed. Label by post_type instead.
    const bodyPreview = `"${(p.body || '').slice(0, 60)}${(p.body || '').length > 60 ? '…' : ''}"`
    const detail =
      p.post_type === 'repost' ? 'reposted a post' :
      p.post_type === 'quote'  ? `quoted a post: ${bodyPreview}` :
      p.post_type === 'reply'  ? `replied: ${bodyPreview}` :
      `posted: ${bodyPreview}`

    events.push({ id: `post-${p.id}`, type: 'post', created_at: p.created_at, actor: `@${p.author?.username || 'unknown'}`, detail, color: '#8A8A85', icon: FileText })
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
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Live activity</h1>
          <p className="mt-0.5 text-sm text-faint">Real-time platform activity — signups, posts, payments, and reports</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-faint">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          Auto-refresh on reload
        </div>
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {FILTERS.map(f => (
          <Link
            key={f.key}
            href={`?type=${f.key}`}
            className="flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 font-display text-[13px] font-semibold no-underline sm:px-4"
            style={{
              color: activeType === f.key ? 'var(--color-text-primary)' : 'var(--color-text-faint)',
              borderBottomColor: activeType === f.key ? 'var(--color-brand)' : 'transparent',
            }}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {filtered.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-sm text-faint">No activity yet</p>
          </div>
        ) : filtered.map((e, i) => {
          const Icon = e.icon
          return (
            <div
              key={e.id}
              className={`flex flex-wrap items-center gap-x-3.5 gap-y-1 px-4 py-3.5 sm:px-5 ${i < filtered.length - 1 ? 'border-b border-[#141418]' : ''}`}
            >
              <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg" style={{ background: `${e.color}18` }}>
                <Icon size={14} color={e.color} />
              </div>
              <div className="min-w-0 flex-1 basis-full sm:basis-0">
                <span className="mr-1.5 font-display text-[13px] font-semibold text-primary">{e.actor}</span>
                <span className="text-[13px] text-secondary">{e.detail}</span>
              </div>
              <span className="flex-shrink-0 pl-[42px] text-xs text-[#3A3A40] sm:pl-0">{formatRelativeTime(e.created_at)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
