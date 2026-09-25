// src/app/(main)/post/[id]/page.tsx
//
// The one page template for a post, a comment, AND a reply - Spup uses the
// same recursive model Threads does: every post and every reply share this
// exact page. Tapping any comment (comment-row.tsx) navigates here with that
// comment's own id, where it becomes the "main post" and its own direct
// replies are listed the same way. There is never more than one level of
// replies rendered at once, so there is no nesting/indentation to design.
//
// If the post being viewed is itself a reply, its own parent is shown as a
// small, muted context card above it (matches Threads: you always see who
// this is a reply to before reading it).

import { createClient, getAuthUser } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import PostCard from '@/components/feed/post-card'
import ReplySortMenu from './reply-sort-menu'
import ParentContextCard from './parent-context-card'
import PostThreadClient from './post-thread-client'
import type { CommentSort } from '@/lib/comment-threads'

const POST_SELECT = `
  id, body, post_type, likes_count, comments_count, reposts_count,
  bookmarks_count, impressions_count, created_at, edited_at, is_sensitive,
  is_pinned, quoted_post_id, is_selling, parent_post_id,
  author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier, is_monetised),
  media:post_media(id, media_type, url, thumbnail_url, width, height, position)
`
const PARENT_SELECT = `
  id, body,
  author:users!posts_user_id_fkey(id, username, display_name, avatar_url)
`

const COMMENTS_PER_PAGE = 50

async function getThreadData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  viewerId: string | null,
  sort: CommentSort,
) {
  const { data: post } = await supabase
    .from('posts').select(POST_SELECT)
    .eq('id', postId).is('deleted_at', null).single()

  if (!post) return null

  const [{ data: parent }, { data: comments, count: commentTotal }] = await Promise.all([
    post.parent_post_id
      ? supabase.from('posts').select(PARENT_SELECT).eq('id', post.parent_post_id).is('deleted_at', null).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('posts').select(POST_SELECT, { count: 'exact' })
      .eq('parent_post_id', postId).is('deleted_at', null)
      .order(sort === 'top' ? 'likes_count' : 'created_at', { ascending: sort !== 'top' })
      .limit(COMMENTS_PER_PAGE),
  ])

  const hasMoreComments = (commentTotal ?? 0) > (comments?.length ?? 0)
  const allIds = [post.id, ...(comments || []).map((c: any) => c.id)]

  const hydrate = (likedSet: Set<string>, bookmarkedSet: Set<string>, repostedSet: Set<string>) => (p: any) => ({
    ...p,
    is_liked: likedSet.has(p.id),
    is_bookmarked: bookmarkedSet.has(p.id),
    is_reposted: repostedSet.has(p.id),
  })

  if (viewerId) {
    const { data: viewer } = await supabase
      .from('users').select('id').eq('auth_id', viewerId).maybeSingle()

    if (viewer) {
      const [{ data: likes }, { data: bookmarks }, { data: reposts }] = await Promise.all([
        supabase.from('likes').select('post_id').eq('user_id', viewer.id).in('post_id', allIds),
        supabase.from('bookmarks').select('post_id').eq('user_id', viewer.id).in('post_id', allIds),
        supabase.from('posts').select('parent_post_id').eq('user_id', viewer.id).eq('post_type', 'repost').in('parent_post_id', allIds),
      ])
      const apply = hydrate(
        new Set((likes || []).map((l: any) => l.post_id)),
        new Set((bookmarks || []).map((b: any) => b.post_id)),
        new Set((reposts || []).map((r: any) => r.parent_post_id)),
      )
      return {
        post: apply(post), parent, comments: (comments || []).map(apply),
        hasMoreComments, viewerProfileId: viewer.id as string,
      }
    }
  }

  const bare = hydrate(new Set(), new Set(), new Set())
  return { post: bare(post), parent, comments: (comments || []).map(bare), hasMoreComments, viewerProfileId: undefined }
}

export default async function PostDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ replySort?: string }>
}) {
  const { id } = await params
  const { replySort: replySortParam } = await searchParams
  const sort: CommentSort = replySortParam === 'top' ? 'top' : 'recent'

  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const data = await getThreadData(supabase, id, user.id, sort)
  if (!data) notFound()

  const { post, parent, comments, hasMoreComments, viewerProfileId } = data

  const { data: viewer } = await supabase
    .from('users').select('id, display_name, avatar_url').eq('auth_id', user.id).maybeSingle()
  const viewerName = viewer?.display_name ?? 'Me'
  const viewerInitial = viewerName.slice(0, 2).toUpperCase()
  const viewerAvatar = viewer?.avatar_url ?? null

  // Matches Threads' own header labels: a reply's page says "Reply", an
  // original post's says "Thread".
  const isReply = !!post.parent_post_id
  const title = isReply ? 'Reply' : 'Thread'

  return (
    <div>
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
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)' }}>
            {title}
          </h1>
          {post.impressions_count > 0 && (
            <p style={{ fontSize: 12, color: 'var(--color-text-faint)', margin: 0 }}>
              {post.impressions_count.toLocaleString()} views
            </p>
          )}
        </div>
      </div>

      {/* Who this is a reply to, if it is one */}
      {parent && <ParentContextCard post={parent as any} />}

      {/* Main post */}
      <PostCard post={post} currentUserId={viewerProfileId} />

      {/* Reply sort + view activity - only shown once there's something to sort/view */}
      {(comments.length > 0 || post.likes_count > 0 || post.reposts_count > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px', borderBottom: '1px solid var(--color-border)',
        }}>
          <ReplySortMenu postId={id} currentSort={sort} />
          <Link
            href={`/post/${id}/activity`}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)', textDecoration: 'none' }}
          >
            View activity <ArrowRight size={13} />
          </Link>
        </div>
      )}

      <PostThreadClient
        postId={id}
        postAuthorId={post.author.id}
        viewerId={viewerProfileId}
        viewerName={viewerName}
        viewerAvatar={viewerAvatar}
        viewerInitial={viewerInitial}
        initialComments={comments as any}
        sort={sort}
        hasMore={hasMoreComments}
      />
    </div>
  )
}
