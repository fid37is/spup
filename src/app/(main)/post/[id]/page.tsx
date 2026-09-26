//app/(main)/post/[id]/page.tsx

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import PostCard from '@/components/feed/post-card'
import RepliesPanel from './replies-panel'
import ReplySortMenu from './reply-sort-menu'

const POST_SELECT = `
  id, body, post_type, likes_count, comments_count, reposts_count,
  bookmarks_count, impressions_count, created_at, edited_at, is_sensitive,
  is_pinned, quoted_post_id, is_selling,
  author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier, is_monetised),
  media:post_media(id, media_type, url, thumbnail_url, width, height, position)
`

// Walks the ENTIRE descendant tree of a set of parent ids, one generation at
// a time, until a generation comes back empty. This replaces the old fixed
// "one extra level" fetch, which is why a reply to a reply's reply used to
// be invisible outright (not collapsed - never fetched, so the tree ended
// there no matter how deep the real thread went). A reply chain can go
// arbitrarily deep, so the loop has to keep going until it actually runs
// dry rather than stopping after a fixed number of hops.
async function getAllDescendants(supabase: Awaited<ReturnType<typeof createClient>>, rootIds: string[]) {
  const all: any[] = []
  let frontier = rootIds

  while (frontier.length > 0) {
    const { data: generation } = await supabase
      .from('posts').select(`${POST_SELECT}, parent_post_id`)
      .in('parent_post_id', frontier).is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(500)

    if (!generation || generation.length === 0) break

    all.push(...generation)
    frontier = generation.map((r: any) => r.id)
  }

  return all
}

// Turns the flat (parent_post_id -> children) map into an actual tree,
// recursively, so a node's `nested` array holds children that themselves
// carry their own `nested` array, however many generations deep the real
// data goes. The rendering side (nested-replies.tsx) mirrors this by
// recursing on `nested` the same way.
function attachNested(node: any, byParent: Record<string, any[]>): any {
  const children = byParent[node.id] || []
  return { ...node, nested: children.map((c: any) => attachNested(c, byParent)) }
}

async function getPost(supabase: Awaited<ReturnType<typeof createClient>>, postId: string, viewerId: string | null, replySort: 'recent' | 'top') {
  const { data: post } = await supabase
    .from('posts').select(POST_SELECT)
    .eq('id', postId).is('deleted_at', null).single()

  if (!post) return null

  const { data: replies } = await supabase
    .from('posts').select(POST_SELECT)
    .eq('parent_post_id', postId).is('deleted_at', null)
    // Both sorts are "biggest first": Recent = newest created_at first (so a
    // reply you just posted shows up at the top, not buried at the bottom
    // behind everyone else's older replies), Top = most-liked first. Neither
    // is ever ascending.
    .order(replySort === 'top' ? 'likes_count' : 'created_at', { ascending: false })
    .limit(50)

  const replyIds = (replies || []).map((r: any) => r.id)
  // Every descendant of every top-level reply, however many generations
  // deep - not just the immediate children. POST_SELECT never includes
  // parent_post_id (it's not needed for the post itself or top-level
  // replies, whose parent is already known from context) - but grouping
  // these under their actual parent needs it explicitly, or parent_post_id
  // is undefined on every row and the grouping below silently groups
  // nothing to anything.
  const allDescendants = replyIds.length > 0 ? await getAllDescendants(supabase, replyIds) : []

  const nestedByParent = allDescendants.reduce((acc: Record<string, any[]>, r: any) => {
    if (!acc[r.parent_post_id]) acc[r.parent_post_id] = []
    acc[r.parent_post_id].push(r)
    return acc
  }, {})

  if (viewerId) {
    const { data: viewer } = await supabase
      .from('users').select('id').eq('auth_id', viewerId).maybeSingle()

    if (viewer) {
      const allIds = [post.id, ...(replies || []).map((r: any) => r.id), ...allDescendants.map((r: any) => r.id)]
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
        replies: (replies || []).map((r: any) => attachNested(hydrate(r), Object.fromEntries(
          Object.entries(nestedByParent).map(([k, v]) => [k, (v as any[]).map(hydrate)])
        ))),
      }
    }
  }

  return {
    post: { ...post, is_liked: false, is_bookmarked: false, is_reposted: false },
    replies: (replies || []).map((r: any) => attachNested(
      { ...r, is_liked: false, is_bookmarked: false, is_reposted: false },
      Object.fromEntries(
        Object.entries(nestedByParent).map(([k, v]) => [
          k, (v as any[]).map((n: any) => ({ ...n, is_liked: false, is_bookmarked: false, is_reposted: false })),
        ])
      )
    )),
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

      {/* Reply sort + view activity - only shown once there's something to sort/view */}
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

      {/* Reply composer + replies list - client-side, so a reply you post
          appears immediately instead of waiting on a page refresh. */}
      <RepliesPanel
        postId={id}
        initialReplies={replies}
        viewerName={viewerName}
        viewerInitial={viewerInitial}
        viewerAvatar={viewerAvatar}
        viewerUserId={viewerUserId}
      />
    </div>
  )
}