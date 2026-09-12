// src/app/(admin)/moderation/page.tsx
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { formatRelativeTime } from '@/lib/utils'
import AdminPostActions from '../posts/post-actions'

// Shows posts that are sensitive-flagged OR have 2+ pending reports — the active moderation queue
async function getModerationQueue() {
  const admin = createAdminClient()

  // Sensitive-flagged posts not yet deleted
  const { data: sensitive } = await admin
    .from('posts')
    .select(`
      id, body, is_sensitive, created_at,
      author:users!posts_user_id_fkey(id, username, display_name, status)
    `)
    .eq('is_sensitive', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(30)

  // Posts with multiple reports
  const { data: reported } = await admin
    .from('reports')
    .select('entity_id')
    .eq('entity_type', 'post')
    .eq('status', 'pending')

  const reportCounts: Record<string, number> = {}
  ;(reported || []).forEach((r: {entity_id: string}) => {
    reportCounts[r.entity_id] = (reportCounts[r.entity_id] || 0) + 1
  })

  const hotPostIds = Object.entries(reportCounts)
    .filter(([, count]) => count >= 2)
    .map(([id]) => id)

  let hotPosts: any[] = []
  if (hotPostIds.length > 0) {
    const { data } = await admin
      .from('posts')
      .select(`
        id, body, is_sensitive, created_at,
        author:users!posts_user_id_fkey(id, username, display_name, status)
      `)
      .in('id', hotPostIds)
      .is('deleted_at', null)

    hotPosts = (data || []).map((p: any) => ({
      ...p,
      reportCount: reportCounts[p.id] || 0,
    }))
  }

  return {
    sensitive: sensitive || [],
    hotPosts,
  }
}

async function getSuspendedUsers() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('users')
    .select('id, username, display_name, status, created_at')
    .eq('status', 'suspended')
    .order('created_at', { ascending: false })
    .limit(20)
  return data || []
}

function QueueCard({
  title, count, countColor, borderColor, emptyLabel, items,
}: {
  title: string; count: number; countColor: string; borderColor: string; emptyLabel: string
  items: { id: string; badge: string; badgeColor: string; author?: string; created_at: string; body: string | null }[]
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-surface" style={{ borderColor }}>
      <div className="flex items-center gap-2 border-b border-[#141418] px-4 py-3.5 sm:px-[18px]">
        <h2 className="font-display text-[15px] font-bold text-primary">{title}</h2>
        {count > 0 && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[11px] font-extrabold"
            style={{ background: countColor, color: countColor === '#D4A017' ? '#000' : '#fff' }}
          >
            {count}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="px-[18px] py-10 text-center">
          <p className="text-sm text-faint">{emptyLabel}</p>
        </div>
      ) : items.map((post, i) => (
        <div key={post.id} className={`px-4 py-3.5 sm:px-[18px] ${i < items.length - 1 ? 'border-b border-[#141418]' : ''}`}>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span
                  className="rounded px-2 py-0.5 text-[11px] font-bold"
                  style={{ background: `${post.badgeColor}1F`, color: post.badgeColor }}
                >
                  {post.badge}
                </span>
                <span className="text-xs text-faint">@{post.author}</span>
                <span className="text-[11px] text-[#3A3A40]">{formatRelativeTime(post.created_at)}</span>
              </div>
              <p className="line-clamp-2 text-[13px] leading-relaxed text-[#C0C0B8]">
                {post.body || <em className="text-faint">[media only]</em>}
              </p>
            </div>
            <div className="flex-shrink-0 self-end sm:self-start">
              <AdminPostActions postId={post.id} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default async function AdminModerationPage() {
  const [{ sensitive, hotPosts }, suspended] = await Promise.all([
    getModerationQueue(),
    getSuspendedUsers(),
  ])

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6 sm:mb-7">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Moderation</h1>
        <p className="mt-0.5 text-sm text-faint">Active content requiring human review</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <QueueCard
          title="Multiple reports"
          count={hotPosts.length}
          countColor="#E53935"
          borderColor="rgba(229,57,53,0.2)"
          emptyLabel="No posts with multiple reports"
          items={hotPosts.map((p: any) => ({
            id: p.id, badge: `${p.reportCount} REPORTS`, badgeColor: '#E53935',
            author: p.author?.username, created_at: p.created_at, body: p.body,
          }))}
        />
        <QueueCard
          title="Sensitive content"
          count={sensitive.length}
          countColor="#D4A017"
          borderColor="rgba(212,160,23,0.15)"
          emptyLabel="No sensitive posts pending review"
          items={sensitive.map((p: any) => ({
            id: p.id, badge: 'SENSITIVE', badgeColor: '#D4A017',
            author: p.author?.username, created_at: p.created_at, body: p.body,
          }))}
        />
      </div>

      {/* Suspended users */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface sm:mt-5">
        <div className="border-b border-[#141418] px-4 py-3.5 sm:px-[18px]">
          <h2 className="font-display text-[15px] font-bold text-primary">Currently suspended users</h2>
        </div>
        {suspended.length === 0 ? (
          <div className="px-[18px] py-8 text-center">
            <p className="text-sm text-faint">No suspended users</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-px bg-[#141418] sm:grid-cols-2 lg:grid-cols-3">
            {suspended.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between gap-3 bg-surface px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-display text-[13px] font-semibold text-primary">{u.display_name}</div>
                  <div className="text-[11px] text-faint">@{u.username}</div>
                </div>
                <Link
                  href={`/users?q=${encodeURIComponent(u.username)}`}
                  className="flex-shrink-0 text-[11px] font-semibold text-brand no-underline"
                >
                  Manage
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
