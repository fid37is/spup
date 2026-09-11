import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import PostCard from '@/components/feed/post-card'
import ReplyComposer from './reply-composer'
import ReplyToReply from './reply-to-reply'
import ReplySortMenu from './reply-sort-menu'
import { formatNumber } from '@/lib/utils'

const POST_SELECT = `
  id, body, post_type, likes_count, comments_count, reposts_count,
  bookmarks_count, impressions_count, created_at, edited_at, is_sensitive,
  author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier, is_monetised),
  media:post_media(id, media_type, url, thumbnail_url, width, height, position)
`

async function getPost(supabase: Awaited<ReturnType<typeof createClient>>, postId: string, viewerId: string | null, replySort: 'recent' | 'top') {
  const { data: post } = await supabase
    .from('posts').select(POST_SELECT)
    .eq('id', postId).is('deleted_at', null).single()

  if (!post) return null

  const { data: replies } = await supabase
    .from('posts').select(POST_SELECT)
    .eq('parent_post_id', postId).is('deleted_at', null)
    .order(replySort === 'top' ? 'likes_count' : 'created_at', { ascending: replySort !== 'top' })
    .limit(50)

  const replyIds = (replies || []).map((r: any) => r.id)
  const { data: nestedReplies } = replyIds.length > 0
    ? await supabase.from('posts').select(POST_SELECT)
        .in('parent_post_id', replyIds).is('deleted_at', null)
        .order('created_at', { ascending: true }).limit(100)
    : { data: [] }

  const nestedByParent = (nestedReplies || []).reduce((acc: Record<string, any[]>, r: any) => {
    if (!acc[r.parent_post_id]) acc[r.parent_post_id] = []
    acc[r.parent_post_id].push(r)
    return acc
  }, {})

  if (viewerId) {
    const { data: viewer } = await supabase
      .from('users').select('id').eq('auth_id', viewerId).maybeSingle()

    if (viewer) {
      const allIds = [post.id, ...(replies || []).map((r: any) => r.id), ...(nestedReplies || []).map((r: any) => r.id)]
      const [{ data: likes }, { data: bookmarks }, { data: reposts }] = await Promise.all([
        supabase.from('likes').select('post_id').eq('user_id', viewer.id).in('post_id', allIds),
        supabase.from('bookmarks').select('post_id').eq('user_id', viewer.id).in('post_id', allIds),
        supabase.from('posts').select('parent_post_id').eq('user_id', viewer.id).eq('post_type', 'repost').in('parent_post_id', allIds),
      ])
      const likedSet = new Set((likes || []).map((l: any) => l.post_id))
      const bookmarkedSet = new Set((bookmarks || []).map((b: any) => b.post_id))
      const repostedSet = new Set((reposts || []).map((r: any) => r.parent_post_id))

      const hydrate = (p: any) => ({
        ...p,
        is_liked: likedSet.has(p.id),
        is_bookmarked: bookmarkedSet.has(p.id),
        is_reposted: repostedSet.has(p.id),
      })

      return {
        post: hydrate(post),
        replies: (replies || []).map((r: any) => ({ ...hydrate(r), nested: (nestedByParent[r.id] || []).map(hydrate) })),
      }
    }
  }

  return {
    post: { ...post, is_liked: false, is_bookmarked: false, is_reposted: false },
    replies: (replies || []).map((r: any) => ({
      ...r, is_liked: false, is_bookmarked: false, is_reposted: false,
      nested: (nestedByParent[r.id] || []).map((n: any) => ({ ...n, is_liked: false, is_bookmarked: false, is_reposted: false })),
    })),
  }
}

export default async function PostDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ replySort?: string }>
}) {
  const { id } = await params
  const { replySort: replySortParam } = await searchParams
  const replySort: 'recent' | 'top' = replySortParam === 'top' ? 'top' : 'recent'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const data = await getPost(supabase, id, user.id, replySort)
  if (!data) notFound()

  const { post, replies } = data

  const { data: viewer } = await supabase
    .from('users').select('id, display_name, avatar_url').eq('auth_id', user.id).maybeSingle()
  const viewerName = viewer?.display_name ?? 'Me'
  const viewerInitial = viewerName.slice(0, 2).toUpperCase()
  const viewerAvatar = viewer?.avatar_url ?? null
  const viewerUserId = viewer?.id ?? undefined

  const date = new Date(post.created_at).toLocaleString('en-NG', {
    hour: '2-digit', minute: '2-digit',
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px',
      }}>
        <Link href="/feed" style={{ color: 'var(--color-text-primary)', display: 'flex' }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)' }}>
          Post
        </h1>
      </div>

      {/* Main post */}
      <PostCard post={post} currentUserId={viewerUserId} />

      {/* Timestamp + views */}
      <div style={{
        padding: '10px 20px 12px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{date}</span>
        {post.impressions_count > 0 && (
          <>
            <span style={{ color: 'var(--color-border-light)' }}>·</span>
            <span style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 600 }}>
              {formatNumber(post.impressions_count)}
            </span>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Views</span>
          </>
        )}
      </div>

      {/* Engagement totals row */}
      {(post.reposts_count > 0 || post.likes_count > 0 || post.bookmarks_count > 0) && (
        <div style={{
          display: 'flex', gap: 20, padding: '12px 20px',
          borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap',
        }}>
          {post.reposts_count > 0 && <StatPill value={post.reposts_count} label="Reposts" />}
          {post.likes_count > 0 && <StatPill value={post.likes_count} label="Likes" />}
          {post.bookmarks_count > 0 && <StatPill value={post.bookmarks_count} label="Bookmarks" />}
        </div>
      )}

      {/* Reply sort + view activity — only shown once there's something to sort/view */}
      {(replies.length > 0 || post.likes_count > 0 || post.reposts_count > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px', borderBottom: '1px solid var(--color-border)',
        }}>
          <ReplySortMenu postId={id} currentSort={replySort} />
          <Link
            href={`/post/${id}/activity`}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)', textDecoration: 'none' }}
          >
            View activity <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {/* Inline reply composer — always under the post, sticky at bottom */}
      <ReplyComposer
        parentPostId={id}
        viewerInitial={viewerInitial}
        viewerAvatar={viewerAvatar}
        viewerName={viewerName}
      />

      {/* Divider */}
      <div style={{ height: 8, background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)' }} />

      {/* Replies */}
      {replies.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-faint)' }}>No replies yet. Be the first!</p>
        </div>
      ) : (
        replies.map((reply: any) => (
          <div key={reply.id}>
            {/* Reply card — clicking the reply button opens reply-to-reply modal/page */}
            <ReplyToReply
              reply={reply}
              viewer={{ display_name: viewerName, avatar_url: viewerAvatar }}
              currentUserId={viewerUserId}
            />
            {reply.nested && reply.nested.length > 0 && (
              <div style={{ position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 36, top: 0, bottom: 0,
                  width: 2, background: 'var(--color-border)',
                }} />
                {reply.nested.map((nested: any) => (
                  <div key={nested.id} style={{ position: 'relative' }}>
                    <ReplyToReply
                      reply={nested}
                      viewer={{ display_name: viewerName, avatar_url: viewerAvatar }}
                      currentUserId={viewerUserId}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <span style={{ fontSize: 15, color: 'var(--color-text-secondary)' }}>
      <strong style={{ color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif" }}>
        {formatNumber(value)}
      </strong>{' '}{label}
    </span>
  )
}