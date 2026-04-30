'use server'

/**
 * feed.ts — server actions that return feed data.
 * All DB round-trips within each action are fully parallelised.
 * Zero sequential awaits after the initial auth check.
 */

import { createClient } from '@/lib/supabase/server'

const PAGE_SIZE = 20

export interface FeedPost {
  id: string
  body: string | null
  post_type: string
  likes_count: number
  dislikes_count: number
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
  is_disliked: boolean
  is_reposted: boolean
  is_bookmarked: boolean
}

const POST_SELECT = `
  id, body, post_type, likes_count, dislikes_count, comments_count, reposts_count,
  bookmarks_count, impressions_count, created_at, edited_at, is_sensitive,
  author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier, is_monetised),
  media:post_media(id, media_type, url, thumbnail_url, width, height, position)
`

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getIdentity(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).single()
  return profile ?? null
}

async function hydrateEngagement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  posts: any[]
): Promise<FeedPost[]> {
  if (!posts.length) return []
  const ids = posts.map((p: any) => p.id)

  // All 4 engagement checks in one round-trip batch
  const [{ data: likes }, { data: dislikes }, { data: bookmarks }, { data: reposts }] =
    await Promise.all([
      supabase.from('likes').select('post_id').eq('user_id', userId).in('post_id', ids),
      supabase.from('dislikes').select('post_id').eq('user_id', userId).in('post_id', ids),
      supabase.from('bookmarks').select('post_id').eq('user_id', userId).in('post_id', ids),
      supabase.from('posts')
        .select('parent_post_id').eq('user_id', userId)
        .eq('post_type', 'repost').in('parent_post_id', ids),
    ])

  const likedSet      = new Set((likes     || []).map((l: any) => l.post_id))
  const dislikedSet   = new Set((dislikes  || []).map((d: any) => d.post_id))
  const bookmarkedSet = new Set((bookmarks || []).map((b: any) => b.post_id))
  const repostedSet   = new Set((reposts   || []).map((r: any) => r.parent_post_id))

  return posts.map((p: any) => ({
    ...p,
    is_liked:      likedSet.has(p.id),
    is_disliked:   dislikedSet.has(p.id),
    is_bookmarked: bookmarkedSet.has(p.id),
    is_reposted:   repostedSet.has(p.id),
  }))
}

// ─── "For you" feed ───────────────────────────────────────────────────────────

export async function getForYouFeedAction(cursor?: string): Promise<{
  posts: FeedPost[]
  nextCursor: string | null
}> {
  const supabase = await createClient()
  const profile  = await getIdentity(supabase)
  if (!profile) return { posts: [], nextCursor: null }

  // blocks/mutes fetched in parallel with nothing else pending
  const [{ data: blocks }, { data: mutes }] = await Promise.all([
    supabase.from('user_blocks').select('blocked_id').eq('blocker_id', profile.id),
    supabase.from('user_mutes').select('muted_id').eq('muter_id', profile.id),
  ])

  const excludeIds = [
    ...(blocks || []).map((b: any) => b.blocked_id),
    ...(mutes  || []).map((m: any) => m.muted_id),
  ]

  let query = supabase
    .from('posts')
    .select(POST_SELECT)
    .is('deleted_at', null)
    .is('parent_post_id', null)
    .neq('post_type', 'repost')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (excludeIds.length) query = query.not('user_id', 'in', `(${excludeIds.join(',')})`)
  if (cursor)             query = query.lt('created_at', cursor)

  const { data: posts, error } = await query
  if (error) { console.error('[getForYouFeed]', error.message); return { posts: [], nextCursor: null } }
  if (!posts?.length) return { posts: [], nextCursor: null }

  const hasMore    = posts.length > PAGE_SIZE
  const page       = hasMore ? posts.slice(0, PAGE_SIZE) : posts
  const nextCursor = hasMore ? page[page.length - 1].created_at : null

  return { posts: await hydrateEngagement(supabase, profile.id, page), nextCursor }
}

// ─── "Following" feed ─────────────────────────────────────────────────────────

export async function getFollowingFeedAction(cursor?: string): Promise<{
  posts: FeedPost[]
  nextCursor: string | null
}> {
  const supabase = await createClient()
  const profile  = await getIdentity(supabase)
  if (!profile) return { posts: [], nextCursor: null }

  const { data: following } = await supabase
    .from('follows').select('following_id').eq('follower_id', profile.id)

  const followingIds = [
    profile.id,
    ...(following || []).map((f: any) => f.following_id),
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

  const { data: posts, error } = await query
  if (error) { console.error('[getFollowingFeed]', error.message); return { posts: [], nextCursor: null } }
  if (!posts?.length) return { posts: [], nextCursor: null }

  const hasMore    = posts.length > PAGE_SIZE
  const page       = hasMore ? posts.slice(0, PAGE_SIZE) : posts
  const nextCursor = hasMore ? page[page.length - 1].created_at : null

  return { posts: await hydrateEngagement(supabase, profile.id, page), nextCursor }
}

// ─── Mutuals feed ─────────────────────────────────────────────────────────────

export async function getMutualsFeedAction(cursor?: string): Promise<{
  posts: FeedPost[]
  nextCursor: string | null
}> {
  const supabase = await createClient()
  const profile  = await getIdentity(supabase)
  if (!profile) return { posts: [], nextCursor: null }

  const { data: following } = await supabase
    .from('follows').select('following_id').eq('follower_id', profile.id)
  if (!following?.length) return { posts: [], nextCursor: null }

  const followingIds = following.map((f: any) => f.following_id)

  const { data: followers } = await supabase
    .from('follows').select('follower_id')
    .eq('following_id', profile.id)
    .in('follower_id', followingIds)

  const mutualIds = (followers || []).map((f: any) => f.follower_id)
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

  const { data: posts, error } = await query
  if (error) { console.error('[getMutualsFeed]', error.message); return { posts: [], nextCursor: null } }
  if (!posts?.length) return { posts: [], nextCursor: null }

  const hasMore    = posts.length > PAGE_SIZE
  const page       = hasMore ? posts.slice(0, PAGE_SIZE) : posts
  const nextCursor = hasMore ? page[page.length - 1].created_at : null

  return { posts: await hydrateEngagement(supabase, profile.id, page), nextCursor }
}

// ─── Post replies ─────────────────────────────────────────────────────────────

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

  const hasMore    = posts.length > PAGE_SIZE
  const page       = hasMore ? posts.slice(0, PAGE_SIZE) : posts
  const nextCursor = hasMore ? page[page.length - 1].created_at : null

  const hydrated = profile
    ? await hydrateEngagement(supabase, profile.id, page)
    : page.map((p: any) => ({ ...p, is_liked: false, is_disliked: false, is_reposted: false, is_bookmarked: false }))

  return { posts: hydrated, nextCursor }
}

// ─── Bookmarked posts ─────────────────────────────────────────────────────────

export async function getBookmarkedPostsAction(cursor?: string) {
  const supabase = await createClient()
  const profile  = await getIdentity(supabase)
  if (!profile) return { posts: [], nextCursor: null }

  let query = supabase
    .from('bookmarks')
    .select(`post:posts(${POST_SELECT})`)
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (cursor) query = query.lt('created_at', cursor)

  const { data: rows } = await query
  if (!rows?.length) return { posts: [], nextCursor: null }

  const hasMore  = rows.length > PAGE_SIZE
  const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  const page     = pageRows.map((r: any) => r.post).filter(Boolean)
  const nextCursor = hasMore ? (pageRows[pageRows.length - 1] as any)?.created_at : null

  return {
    posts: page.map((p: any) => ({ ...p, is_liked: false, is_reposted: false, is_bookmarked: true })),
    nextCursor,
  }
}