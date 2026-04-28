import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import PostCard from '@/components/feed/post-card'
import ReplyComposer from './reply-composer'
import { formatNumber } from '@/lib/utils'

const POST_SELECT = `
  id, body, post_type, likes_count, dislikes_count, comments_count, reposts_count,
  bookmarks_count, impressions_count, created_at, edited_at, is_sensitive,
  author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier, is_monetised),
  media:post_media(id, media_type, url, thumbnail_url, width, height, position)
`

async function getPost(supabase: Awaited<ReturnType<typeof createClient>>, postId: string, viewerId: string | null) {
  const { data: post } = await supabase
    .from('posts').select(POST_SELECT)
    .eq('id', postId).is('deleted_at', null).single()

  if (!post) return null

  const { data: replies } = await supabase
    .from('posts').select(POST_SELECT)
    .eq('parent_post_id', postId).is('deleted_at', null)
    .order('created_at', { ascending: true }).limit(50)

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
      const [{ data: likes }, { data: dislikes }, { data: bookmarks }, { data: reposts }] = await Promise.all([
        supabase.from('likes').select('post_id').eq('user_id', viewer.id).in('post_id', allIds),
        supabase.from('dislikes').select('post_id').eq('user_id', viewer.id).in('post_id', allIds),
        supabase.from('bookmarks').select('post_id').eq('user_id', viewer.id).in('post_id', allIds),
        supabase.from('posts').select('parent_post_id').eq('user_id', viewer.id).eq('post_type', 'repost').in('parent_post_id', allIds),
      ])
      const likedSet = new Set((likes || []).map((l: any) => l.post_id))
      const dislikedSet = new Set((dislikes || []).map((d: any) => d.post_id))
      const bookmarkedSet = new Set((bookmarks || []).map((b: any) => b.post_id))
      const repostedSet = new Set((reposts || []).map((r: any) => r.parent_post_id))

      const hydrate = (p: any) => ({
        ...p,
        is_liked: likedSet.has(p.id),
        is_disliked: dislikedSet.has(p.id),
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
    post: { ...post, is_liked: false, is_disliked: false, is_bookmarked: false, is_reposted: false },
    replies: (replies || []).map((r: any) => ({
      ...r, is_liked: false, is_disliked: false, is_bookmarked: false, is_reposted: false,
      nested: (nestedByParent[r.id] || []).map((n: any) => ({ ...n, is_liked: false, is_disliked: false, is_bookmarked: false, is_reposted: false })),
    })),
  }
}

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Single supabase client reused for both auth and all DB queries
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const data = await getPost(supabase, id, user.id)
  if (!data) notFound()

  const { post, replies } = data

  // Fetch viewer's display name for the reply composer avatar
  const { data: viewer } = await supabase
    .from('users').select('display_name, avatar_url').eq('auth_id', user.id).maybeSingle()
  const viewerInitial = viewer?.display_name?.slice(0, 2).toUpperCase() ?? '?'
  const viewerAvatar = viewer?.avatar_url ?? null

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
      <PostCard post={post} />

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
      {(post.reposts_count > 0 || post.likes_count > 0 || post.dislikes_count > 0 || post.bookmarks_count > 0) && (
        <div style={{
          display: 'flex', gap: 20, padding: '12px 20px',
          borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap',
        }}>
          {post.reposts_count > 0 && <StatPill value={post.reposts_count} label="Reposts" />}
          {post.likes_count > 0 && <StatPill value={post.likes_count} label="Likes" />}
          {post.dislikes_count > 0 && <StatPill value={post.dislikes_count} label="Dislikes" />}
          {post.bookmarks_count > 0 && <StatPill value={post.bookmarks_count} label="Bookmarks" />}
        </div>
      )}

      {/* Reply composer */}
      <ReplyComposer parentPostId={id} viewerInitial={viewerInitial} viewerAvatar={viewerAvatar} />

      {/* Divider */}
      <div style={{ height: 8, background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)' }} />

      {/* Replies with nested thread lines */}
      {replies.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-faint)' }}>No replies yet. Be the first!</p>
        </div>
      ) : (
        replies.map((reply: any) => (
          <div key={reply.id}>
            <PostCard post={reply} />
            {reply.nested && reply.nested.length > 0 && (
              <div style={{ position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 36, top: 0, bottom: 0,
                  width: 2, background: 'var(--color-border)',
                }} />
                {reply.nested.map((nested: any) => (
                  <div key={nested.id} style={{ position: 'relative' }}>
                    <PostCard post={nested} />
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