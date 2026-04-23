import { createClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import PostCard from '@/components/feed/post-card'
import ReplyComposer from './reply-composer'

async function getPost(postId: string, authUserId: string) {
  const supabase = await createClient()

  const { data: viewer } = await supabase
    .from('users').select('id').eq('auth_id', authUserId).maybeSingle()

  const { data: post } = await supabase
    .from('posts')
    .select(`
      id, body, post_type, likes_count, comments_count, reposts_count,
      bookmarks_count, impressions_count, created_at, edited_at, is_sensitive,
      author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier, is_monetised),
      media:post_media(id, media_type, url, thumbnail_url, width, height, position)
    `)
    .eq('id', postId)
    .is('deleted_at', null)
    .single()

  if (!post) return null

  const { data: replies } = await supabase
    .from('posts')
    .select(`
      id, body, post_type, likes_count, comments_count, reposts_count,
      bookmarks_count, impressions_count, created_at, edited_at, is_sensitive,
      author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier, is_monetised),
      media:post_media(id, media_type, url, thumbnail_url, width, height, position)
    `)
    .eq('parent_post_id', postId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(50)

  // Batch like/bookmark status
  if (viewer && replies?.length) {
    const allIds = [post.id, ...(replies || []).map((r: any) => r.id)]
    const [{ data: likes }, { data: bookmarks }] = await Promise.all([
      supabase.from('likes').select('post_id').eq('user_id', viewer.id).in('post_id', allIds),
      supabase.from('bookmarks').select('post_id').eq('user_id', viewer.id).in('post_id', allIds),
    ])
    const likedSet = new Set((likes || []).map((l: any) => l.post_id))
    const bookmarkedSet = new Set((bookmarks || []).map((b: any) => b.post_id))

    return {
      post: { ...post, is_liked: likedSet.has(post.id), is_bookmarked: bookmarkedSet.has(post.id) },
      replies: (replies || []).map((r: any) => ({
        ...r,
        is_liked: likedSet.has(r.id),
        is_bookmarked: bookmarkedSet.has(r.id),
      })),
    }
  }

  return { post, replies: replies || [] }
}

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const data = await getPost(id, user.id)
  if (!data) notFound()

  const { post, replies } = data
  const date = new Date(post.created_at).toLocaleString('en-NG', {
    hour: '2-digit', minute: '2-digit',
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'rgba(10,10,10,0.9)',
        borderBottom: '1px solid #1A1A1A',
        display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px',
      }}>
        <Link href="/feed" style={{ color: '#F5F5F0', display: 'flex' }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: '#F5F5F0' }}>
          Post
        </h1>
      </div>

      {/* Main post */}
      <PostCard post={post} />

      {/* Full timestamp */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #1A1A1A' }}>
        <span style={{ fontSize: 14, color: '#3A3A35' }}>{date}</span>
      </div>

      {/* Engagement counts */}
      {(post.reposts_count > 0 || post.likes_count > 0 || post.bookmarks_count > 0) && (
        <div style={{
          display: 'flex', gap: 20, padding: '14px 20px',
          borderBottom: '1px solid #1A1A1A',
        }}>
          {post.reposts_count > 0 && (
            <span style={{ fontSize: 15, color: '#9A9A90' }}>
              <strong style={{ color: '#F5F5F0', fontFamily: "'Syne', sans-serif" }}>{post.reposts_count}</strong>{' '}
              Reposts
            </span>
          )}
          {post.likes_count > 0 && (
            <span style={{ fontSize: 15, color: '#9A9A90' }}>
              <strong style={{ color: '#F5F5F0', fontFamily: "'Syne', sans-serif" }}>{post.likes_count}</strong>{' '}
              Likes
            </span>
          )}
          {post.bookmarks_count > 0 && (
            <span style={{ fontSize: 15, color: '#9A9A90' }}>
              <strong style={{ color: '#F5F5F0', fontFamily: "'Syne', sans-serif" }}>{post.bookmarks_count}</strong>{' '}
              Bookmarks
            </span>
          )}
        </div>
      )}

      {/* Reply composer */}
      <ReplyComposer parentPostId={id} />

      {/* Replies */}
      <div style={{ borderTop: '1px solid #1A1A1A' }}>
        {replies.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#555' }}>No replies yet. Be the first!</p>
          </div>
        ) : (
          replies.map((reply: any) => <PostCard key={reply.id} post={reply} />)
        )}
      </div>
    </div>
  )
}
