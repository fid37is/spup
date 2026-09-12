// src/app/(admin)/posts/page.tsx
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { formatRelativeTime, formatNumber } from '@/lib/utils'
import AdminPostActions from './post-actions'

interface SearchParams { q?: string; flagged?: string; page?: string }

async function getPosts(params: SearchParams) {
  const admin = createAdminClient()
  const page = parseInt(params.page || '1')
  const limit = 30
  const from = (page - 1) * limit

  let query = admin
    .from('posts')
    .select(`
      id, body, post_type, likes_count, comments_count, reposts_count,
      impressions_count, is_sensitive, created_at, deleted_at,
      author:users!posts_user_id_fkey(id, username, display_name, status)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (params.q) query = query.ilike('body', `%${params.q}%`)
  if (params.flagged === 'true') query = query.eq('is_sensitive', true)
  // Show all including deleted when filtering
  if (!params.flagged) query = query.is('deleted_at', null)

  const { data, count } = await query
  return { posts: data || [], total: count || 0, page, limit }
}

export default async function AdminPostsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const { posts, total, page, limit } = await getPosts(params)
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Posts</h1>
        <p className="mt-0.5 text-sm text-faint">{formatNumber(total)} total</p>
      </div>

      {/* Filters */}
      <form className="mb-5 flex flex-wrap items-center gap-2.5 sm:gap-3">
        <input
          name="q" defaultValue={params.q}
          placeholder="Search post content…"
          className="min-w-0 flex-1 basis-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-primary outline-none sm:basis-60"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
          <input type="checkbox" name="flagged" value="true" defaultChecked={params.flagged === 'true'} />
          Sensitive only
        </label>
        <button type="submit" className="rounded-lg bg-brand px-4 py-2.5 font-display text-sm font-semibold text-white">
          Search
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {posts.map((post: any, i: number) => (
          <div
            key={post.id}
            className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:gap-4 sm:px-5 ${i < posts.length - 1 ? 'border-b border-[#141418]' : ''} ${post.deleted_at ? 'opacity-40' : ''}`}
          >
            {/* Author */}
            <div className="flex items-baseline gap-2 sm:w-40 sm:flex-shrink-0 sm:flex-col sm:items-start sm:gap-0">
              <div className="font-display text-[13px] font-semibold text-primary">
                {post.author?.display_name}
              </div>
              <div className="text-[11px] text-faint">@{post.author?.username}</div>
              <div className="text-[11px] text-faint sm:mt-0.5">{formatRelativeTime(post.created_at)}</div>
            </div>

            {/* Body */}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-3 text-sm leading-relaxed text-[#C0C0B8]">
                {post.body || <em className="text-faint">[media only]</em>}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {[
                  { label: '♡', v: post.likes_count },
                  { label: '↩', v: post.comments_count },
                  { label: '⇄', v: post.reposts_count },
                  { label: '👁', v: post.impressions_count },
                ].map(({ label, v }) => (
                  <span key={label} className="text-xs text-faint">{label} {formatNumber(v)}</span>
                ))}
                {post.is_sensitive && (
                  <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-error" style={{ background: 'rgba(229,57,53,0.12)' }}>SENSITIVE</span>
                )}
                {post.deleted_at && (
                  <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-faint" style={{ background: 'rgba(100,100,100,0.15)' }}>DELETED</span>
                )}
              </div>
            </div>

            {/* Actions */}
            {!post.deleted_at && (
              <div className="flex flex-shrink-0 justify-end sm:justify-start">
                <AdminPostActions postId={post.id} />
              </div>
            )}
          </div>
        ))}

        {posts.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-faint">No posts found</p>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
            const p = i + 1
            return (
              <Link
                key={p}
                href={`?${new URLSearchParams({ ...params, page: String(p) })}`}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border text-[13px] font-semibold no-underline ${
                  p === page ? 'border-brand bg-brand text-white' : 'border-border bg-surface text-secondary'
                }`}
              >
                {p}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
