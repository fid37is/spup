'use server'

import { createClient } from '@/lib/supabase/server'
import { scorePost, type ScoringContext } from '@/lib/feed/scoring'

const PAGE_SIZE = 20
const FOR_YOU_FETCH_SIZE = 100

export interface FeedPost {
  id: string
  body: string | null
  post_type: string
  likes_count: number
  comments_count: number
  reposts_count: number
  bookmarks_count: number
  impressions_count: number
  created_at: string
  edited_at: string | null
  is_sensitive: boolean
  author: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
    verification_tier: string
    is_monetised: boolean
  }
  media: Array<{
    id: string
    media_type: string
    url: string
    thumbnail_url: string | null
    width: number | null
    height: number | null
    position: number
  }>
  is_liked: boolean
  is_reposted: boolean
  is_bookmarked: boolean
}

const POST_SELECT = `
  id, body, post_type, likes_count, comments_count, reposts_count,
  bookmarks_count, impressions_count, created_at, edited_at, is_sensitive,
  author:users!posts_user_id_fkey(
    id, username, display_name, avatar_url, verification_tier, is_monetised
  ),
  media:post_media(id, media_type, url, thumbnail_url, width, height, position)
`

// ─── For You — algorithmic ────────────────────────────────────────────────────

export async function getForYouFeedAction(cursor?: string): Promise<{
  posts: FeedPost[]
  nextCursor: string | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { posts: [], nextCursor: null }

  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return { posts: [], nextCursor: null }

  const [
    { data: blocks },
    { data: mutes },
    { data: following },
  ] = await Promise.all([
    supabase.from('user_blocks').select('blocked_id').eq('blocker_id', profile.id),
    supabase.from('user_mutes').select('muted_id').eq('muter_id', profile.id),
    supabase.from('follows').select('following_id').eq('follower_id', profile.id),
  ])

  const excludeIds = [
    ...(blocks || []).map((b: any) => b.blocked_id),
    ...(mutes  || []).map((m: any) => m.muted_id),
  ]
  const followingIds = new Set((following || []).map((f: any) => f.following_id as string))

  // Find mutuals for scoring boost
  const { data: mutualFollows } = followingIds.size
    ? await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', profile.id)
        .in('follower_id', [...followingIds])
    : { data: [] }
  const mutualIds = new Set((mutualFollows || []).map((f: any) => f.follower_id as string))

  const ctx: ScoringContext = { followingIds, mutualIds }

  let query = supabase
    .from('posts')
    .select(POST_SELECT)
    .is('deleted_at', null)
    .is('parent_post_id', null)
    .neq('post_type', 'repost')
    .order('created_at', { ascending: false })
    .limit(FOR_YOU_FETCH_SIZE)

  if (excludeIds.length) {
    query = query.not('user_id', 'in', `(${excludeIds.join(',')})`)
  }
  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data: posts } = await query
  if (!posts?.length) return { posts: [], nextCursor: null }

  // Score, sort, take top PAGE_SIZE
  const scored = posts
    .map(p => ({ post: p, score: scorePost(p, ctx) }))
    .sort((a, b) => b.score - a.score)

  const page = scored.slice(0, PAGE_SIZE).map(s => s.post)
  const hasMore = scored.length > PAGE_SIZE
  const nextCursor = hasMore ? posts[posts.length - 1].created_at : null

  return { posts: await hydrateEngagement(supabase, profile.id, page), nextCursor }
}

// ─── Following — chronological ────────────────────────────────────────────────

export async function getFollowingFeedAction(cursor?: string): Promise<{
  posts: FeedPost[]
  nextCursor: string | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { posts: [], nextCursor: null }

  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return { posts: [], nextCursor: null }

  const { data: following } = await supabase
    .from('follows').select('following_id').eq('follower_id', profile.id)

  const followingIds = [
    profile.id,
    ...(following || []).map((f: any) => f.following_id as string),
  ]

  let query = supabase
    .from('posts')
    .select(POST_SELECT)
    .is('deleted_at', null)
    .is('parent_post_id', null)
    .neq('post_type', 'repost')
    .in('user_id', followingIds)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (cursor) query = query.lt('created_at', cursor)

  const { data: posts } = await query
  if (!posts?.length) return { posts: [], nextCursor: null }

  const hasMore = posts.length > PAGE_SIZE
  const page = hasMore ? posts.slice(0, PAGE_SIZE) : posts
  const nextCursor = hasMore ? page[page.length - 1].created_at : null

  return { posts: await hydrateEngagement(supabase, profile.id, page), nextCursor }
}

// ─── Mutuals — chronological, reciprocal follows only ────────────────────────

export async function getMutualsFeedAction(cursor?: string): Promise<{
  posts: FeedPost[]
  nextCursor: string | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { posts: [], nextCursor: null }

  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return { posts: [], nextCursor: null }

  // People you follow
  const { data: following } = await supabase
    .from('follows').select('following_id').eq('follower_id', profile.id)
  const followingIds = (following || []).map((f: any) => f.following_id as string)
  if (!followingIds.length) return { posts: [], nextCursor: null }

  // Of those, who follows you back
  const { data: mutualFollows } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('following_id', profile.id)
    .in('follower_id', followingIds)
  const mutualIds = (mutualFollows || []).map((f: any) => f.follower_id as string)
  if (!mutualIds.length) return { posts: [], nextCursor: null }

  let query = supabase
    .from('posts')
    .select(POST_SELECT)
    .is('deleted_at', null)
    .is('parent_post_id', null)
    .neq('post_type', 'repost')
    .in('user_id', mutualIds)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (cursor) query = query.lt('created_at', cursor)

  const { data: posts } = await query
  if (!posts?.length) return { posts: [], nextCursor: null }

  const hasMore = posts.length > PAGE_SIZE
  const page = hasMore ? posts.slice(0, PAGE_SIZE) : posts
  const nextCursor = hasMore ? page[page.length - 1].created_at : null

  return { posts: await hydrateEngagement(supabase, profile.id, page), nextCursor }
}

// ─── Replies for a post ───────────────────────────────────────────────────────

export async function getPostRepliesAction(postId: string, cursor?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const profile = user
    ? (await supabase.from('users').select('id').eq('auth_id', user.id).single()).data
    : null

  let query = supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('parent_post_id', postId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(PAGE_SIZE + 1)

  if (cursor) query = query.gt('created_at', cursor)

  const { data: posts } = await query
  if (!posts?.length) return { posts: [], nextCursor: null }

  const hasMore = posts.length > PAGE_SIZE
  const page = hasMore ? posts.slice(0, PAGE_SIZE) : posts
  const nextCursor = hasMore ? page[page.length - 1].created_at : null

  const hydrated = profile
    ? await hydrateEngagement(supabase, profile.id, page)
    : page.map(p => ({ ...p, is_liked: false, is_reposted: false, is_bookmarked: false }))

  return { posts: hydrated, nextCursor }
}

// ─── Bookmarked posts ─────────────────────────────────────────────────────────

export async function getBookmarkedPostsAction(cursor?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { posts: [], nextCursor: null }

  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return { posts: [], nextCursor: null }

  let query = supabase
    .from('bookmarks')
    .select(`
      post:posts(
        id, body, post_type, likes_count, comments_count, reposts_count,
        bookmarks_count, impressions_count, created_at, edited_at, is_sensitive,
        author:users!posts_user_id_fkey(
          id, username, display_name, avatar_url, verification_tier, is_monetised
        ),
        media:post_media(id, media_type, url, thumbnail_url, width, height, position)
      )
    `)
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (cursor) query = query.lt('created_at', cursor)

  const { data: rows } = await query
  if (!rows?.length) return { posts: [], nextCursor: null }

  const hasMore = rows.length > PAGE_SIZE
  const page = (hasMore ? rows.slice(0, PAGE_SIZE) : rows)
    .map((r: any) => r.post)
    .filter(Boolean) as any[]
  const nextCursor = hasMore ? (rows[page.length - 1] as any)?.created_at : null

  return {
    posts: page.map((p: any) => ({ ...p, is_liked: false, is_reposted: false, is_bookmarked: true })),
    nextCursor,
  }
}

// ─── Internal: batch-hydrate like/repost/bookmark state ──────────────────────

async function hydrateEngagement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  posts: any[]
): Promise<FeedPost[]> {
  if (!posts.length) return []
  const ids = posts.map(p => p.id)

  const [{ data: likes }, { data: bookmarks }, { data: reposts }] = await Promise.all([
    supabase.from('likes').select('post_id').eq('user_id', userId).in('post_id', ids),
    supabase.from('bookmarks').select('post_id').eq('user_id', userId).in('post_id', ids),
    supabase.from('posts').select('parent_post_id').eq('user_id', userId).eq('post_type', 'repost').in('parent_post_id', ids),
  ])

  const likedSet      = new Set((likes     || []).map((l: any) => l.post_id))
  const bookmarkedSet = new Set((bookmarks || []).map((b: any) => b.post_id))
  const repostedSet   = new Set((reposts   || []).map((r: any) => r.parent_post_id))

  return posts.map(p => ({
    ...p,
    is_liked:      likedSet.has(p.id),
    is_bookmarked: bookmarkedSet.has(p.id),
    is_reposted:   repostedSet.has(p.id),
  }))
}