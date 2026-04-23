// src/app/(admin)/admin/posts/page.tsx
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
    <div style={{ padding: '28px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em' }}>Posts</h1>
        <p style={{ fontSize: 14, color: '#44444A', marginTop: 2 }}>{formatNumber(total)} total</p>
      </div>

      {/* Filters */}
      <form style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          name="q" defaultValue={params.q}
          placeholder="Search post content…"
          style={{ flex: 1, minWidth: 240, background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 8, padding: '9px 14px', color: '#F0F0EC', fontSize: 14, outline: 'none', fontFamily: "'DM Sans', sans-serif" }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#8A8A85', cursor: 'pointer' }}>
          <input type="checkbox" name="flagged" value="true" defaultChecked={params.flagged === 'true'} />
          Sensitive only
        </label>
        <button type="submit" style={{ background: '#1A9E5F', color: 'white', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}>
          Search
        </button>
      </form>

      <div style={{ background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, overflow: 'hidden' }}>
        {posts.map((post: any, i: number) => (
          <div key={post.id} style={{
            display: 'flex', gap: 16, padding: '16px 20px',
            borderBottom: i < posts.length - 1 ? '1px solid #141418' : 'none',
            opacity: post.deleted_at ? 0.4 : 1,
          }}>
            {/* Author */}
            <div style={{ width: 160, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#F0F0EC', fontFamily: "'Syne', sans-serif" }}>
                {post.author?.display_name}
              </div>
              <div style={{ fontSize: 11, color: '#44444A' }}>@{post.author?.username}</div>
              <div style={{ fontSize: 11, color: '#44444A', marginTop: 2 }}>{formatRelativeTime(post.created_at)}</div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, color: '#C0C0B8', lineHeight: 1.5, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>
                {post.body || <em style={{ color: '#44444A' }}>[media only]</em>}
              </p>
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                {[
                  { label: '♡', v: post.likes_count },
                  { label: '↩', v: post.comments_count },
                  { label: '⇄', v: post.reposts_count },
                  { label: '👁', v: post.impressions_count },
                ].map(({ label, v }) => (
                  <span key={label} style={{ fontSize: 12, color: '#44444A' }}>{label} {formatNumber(v)}</span>
                ))}
                {post.is_sensitive && (
                  <span style={{ fontSize: 11, background: 'rgba(229,57,53,0.12)', color: '#E53935', padding: '1px 7px', borderRadius: 5, fontWeight: 600 }}>SENSITIVE</span>
                )}
                {post.deleted_at && (
                  <span style={{ fontSize: 11, background: 'rgba(100,100,100,0.15)', color: '#555', padding: '1px 7px', borderRadius: 5, fontWeight: 600 }}>DELETED</span>
                )}
              </div>
            </div>

            {/* Actions */}
            {!post.deleted_at && (
              <div style={{ flexShrink: 0 }}>
                <AdminPostActions postId={post.id} />
              </div>
            )}
          </div>
        ))}

        {posts.length === 0 && (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#44444A' }}>No posts found</p>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
            const p = i + 1
            return (
              <a key={p} href={`?${new URLSearchParams({ ...params, page: String(p) })}`} style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: p === page ? '#1A9E5F' : '#0D0D12', border: '1px solid #1E1E26', color: p === page ? 'white' : '#6A6A60', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                {p}
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}