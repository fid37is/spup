// src/app/(admin)/flagged/page.tsx
// Review queue for posts/replies that matched a word rule (Word rules page).
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { formatRelativeTime } from '@/lib/utils'
import FlagActions from './flag-actions'

interface SearchParams { status?: string }

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:   { bg: 'rgba(212,160,23,0.12)',  color: '#D4A017' },
  actioned:  { bg: 'rgba(229,57,53,0.12)',   color: '#E53935' },
  dismissed: { bg: 'rgba(100,100,100,0.12)', color: '#555' },
}

async function getFlags(status: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('content_flags')
    .select(`
      id, user_id, post_id, outcome, matched_terms, categories, snippet, status, review_notes, created_at,
      author:users!content_flags_user_id_fkey(id, username, display_name, status),
      post:posts!content_flags_post_id_fkey(id, body, deleted_at)
    `)
    .eq('status', status)
    .order('created_at', { ascending: status === 'pending' })
    .limit(50)

  const flags = (data || []) as any[]

  // How many times each author has tripped a rule (any status) - repeat
  // offenders are the ones worth acting on.
  const userIds = [...new Set(flags.map(f => f.user_id))]
  const totals: Record<string, number> = {}
  if (userIds.length > 0) {
    const { data: all } = await admin.from('content_flags').select('user_id').in('user_id', userIds)
    for (const row of all || []) totals[(row as any).user_id] = (totals[(row as any).user_id] || 0) + 1
  }

  return flags.map(f => ({
    ...f,
    author: Array.isArray(f.author) ? f.author[0] : f.author,
    post: Array.isArray(f.post) ? f.post[0] : f.post,
    authorTotal: totals[f.user_id] || 1,
  }))
}

async function getCounts() {
  const admin = createAdminClient()
  const counts: Record<string, number> = {}
  await Promise.all(['pending', 'actioned', 'dismissed'].map(async s => {
    const { count } = await admin.from('content_flags').select('id', { count: 'exact', head: true }).eq('status', s)
    counts[s] = count || 0
  }))
  return counts
}

export default async function FlaggedContentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const activeStatus = ['pending', 'actioned', 'dismissed'].includes(params.status || '') ? params.status! : 'pending'
  const [flags, counts] = await Promise.all([getFlags(activeStatus), getCounts()])

  const TABS = [
    { key: 'pending',   label: 'Pending',   count: counts.pending },
    { key: 'actioned',  label: 'Actioned',  count: counts.actioned },
    { key: 'dismissed', label: 'Dismissed', count: counts.dismissed },
  ]

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Flagged content</h1>
        <p className="mt-0.5 text-sm text-faint">Posts and replies that matched a word rule</p>
      </div>

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

      {flags.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface px-5 py-16 text-center">
          <div className="mb-3 text-3xl">✓</div>
          <p className="text-[15px] text-faint">Nothing {activeStatus}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {flags.map((f: any) => {
            const pill = STATUS_STYLE[f.status] || STATUS_STYLE.pending
            const blocked = f.outcome === 'blocked'
            const postGone = !blocked && (!f.post || f.post.deleted_at)
            const text = blocked ? f.snippet : (f.post?.body ?? f.snippet)
            const livePostId = !blocked && f.post && !f.post.deleted_at ? f.post.id : null

            return (
              <div key={f.id} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2.5 flex flex-wrap items-center gap-2">
                      <span className="rounded px-2 py-0.5 text-[11px] font-bold tracking-wide" style={{ background: pill.bg, color: pill.color }}>
                        {f.status.toUpperCase()}
                      </span>
                      <span
                        className="rounded px-2 py-0.5 text-[11px] font-bold"
                        style={blocked
                          ? { background: 'rgba(229,57,53,0.12)', color: '#E53935' }
                          : { background: 'rgba(55,138,221,0.12)', color: '#378ADD' }}
                      >
                        {blocked ? 'BLOCKED - never published' : 'PUBLISHED'}
                      </span>
                      {(f.categories || []).map((c: string) => (
                        <span key={c} className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-semibold capitalize text-secondary">{c}</span>
                      ))}
                      <span className="text-xs text-[#3A3A40]">·</span>
                      <span className="text-xs text-[#3A3A40]">{formatRelativeTime(f.created_at)}</span>
                    </div>

                    <div className="text-[13px] text-secondary">
                      By{' '}
                      <Link href={`/users?q=${encodeURIComponent(f.author?.username || '')}`} className="font-semibold text-[#8A8A85] no-underline">
                        @{f.author?.username}
                      </Link>
                      {f.author?.status && f.author.status !== 'active' && (
                        <span className="ml-1.5 text-[11px] font-bold uppercase text-error">{f.author.status}</span>
                      )}
                      {f.authorTotal > 1 && (
                        <span className="ml-2 text-xs font-semibold text-gold">{f.authorTotal} flags in total</span>
                      )}
                    </div>

                    <div className="mt-2 rounded-lg bg-[color:var(--color-surface-2)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#C0C0B8]">
                      {postGone
                        ? <em className="text-faint">This post has been removed.</em>
                        : (text || <em className="text-faint">[no text]</em>)}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-faint">
                      Matched:
                      {(f.matched_terms || []).map((t: string) => (
                        <span key={t} className="rounded bg-error/10 px-1.5 py-0.5 font-mono text-[11px] text-error">{t}</span>
                      ))}
                    </div>

                    {f.review_notes && (
                      <p className="mt-2 text-xs italic text-faint">Notes: {f.review_notes}</p>
                    )}

                    {livePostId && (
                      <div className="mt-2.5">
                        <a href={`/post/${livePostId}`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand no-underline">
                          View post →
                        </a>
                      </div>
                    )}
                  </div>

                  {f.status === 'pending' && (
                    <div className="flex justify-end sm:justify-start">
                      <FlagActions flagId={f.id} postId={livePostId} userId={f.user_id} />
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
