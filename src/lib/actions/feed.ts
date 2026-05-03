'use server'

/**
 * feed.ts — server actions that RETURN feed data.
 * These are the "queries with auth context" — they need the caller's
 * identity to filter blocks/mutes and hydrate like/bookmark state.
 *
 * Pure read-only queries (no auth required) live in lib/queries/posts.ts.
 * Cursor-based pagination so the client can implement infinite scroll.
 */

import { createClient } from '@/lib/supabase/server'

const PAGE_SIZE = 20

// Shape of a fully-hydrated feed post
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
  link_clicks_count: number
  detail_expands_count: number
  video_views_count: number
  video_completions_count: number
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
  quoted_post_id: string | null
  quoted_post?: {
    id: string
    body: string | null
    created_at: string
    author: { id: string; username: string; display_name: string; avatar_url: string | null; verification_tier: string }
    media: Array<{ id: string; media_type: string; url: string; thumbnail_url: string | null; width: number | null; height: number | null; position: number }>
  } | null
  is_liked: boolean
  is_disliked: boolean
  is_reposted: boolean
  is_bookmarked: boolean
}

// ─── "For you" feed — algorithmic ────────────────────────────────────────────

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

  // Exclude posts from blocked/muted users
  const [{ data: blocks }, { data: mutes }] = await Promise.all([
    supabase.from('user_blocks').select('blocked_id').eq('blocker_id', profile.id),
    supabase.from('user_mutes').select('muted_id').eq('muter_id', profile.id),
  ])
  const excludeIds = [
    ...(blocks || []).map((b: {blocked_id: string}) => b.blocked_id),
    ...(mutes || []).map((m: {muted_id: string}) => m.muted_id),
  ]

  let query = supabase
    .from('posts')
    .select(`
      id, body, post_type, likes_count, dislikes_count, comments_count, reposts_count,
      bookmarks_count, impressions_count, link_clicks_count, detail_expands_count, video_views_count, video_completions_count, created_at, edited_at, is_sensitive, quoted_post_id,
      author:users!posts_user_id_fkey(
        id, username, display_name, avatar_url, verification_tier, is_monetised
      ),
      media:post_media(id, media_type, url, thumbnail_url, width, height, position)
    `)
    .is('deleted_at', null)
    .is('parent_post_id', null)          // top-level posts only
    .neq('post_type', 'repost')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)                // fetch one extra to know if there's a next page

  if (excludeIds.length) {
    query = query.not('user_id', 'in', `(${excludeIds.join(',')})`)
  }
  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data: posts } = await query
  if (!posts?.length) return { posts: [], nextCursor: null }

  const hasMore = posts.length > PAGE_SIZE
  const page = hasMore ? posts.slice(0, PAGE_SIZE) : posts
  const nextCursor = hasMore ? page[page.length - 1].created_at : null

  return { posts: await hydrateEngagement(supabase, profile.id, page), nextCursor }
}

// ─── "Following" feed — chronological ────────────────────────────────────────

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

  // Get following IDs
  const { data: following } = await supabase
    .from('follows').select('following_id').eq('follower_id', profile.id)

  const followingIds = [
    profile.id, // include own posts
    ...(following || []).map((f: {following_id: string}) => f.following_id),
  ]

  let query = supabase
    .from('posts')
    .select(`
      id, body, post_type, likes_count, dislikes_count, comments_count, reposts_count,
      bookmarks_count, impressions_count, link_clicks_count, detail_expands_count, video_views_count, video_completions_count, created_at, edited_at, is_sensitive, quoted_post_id,
      author:users!posts_user_id_fkey(
        id, username, display_name, avatar_url, verification_tier, is_monetised
      ),
      media:post_media(id, media_type, url, thumbnail_url, width, height, position)
    `)
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


// ─── Mutuals feed ─────────────────────────────────────────────────────────────

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

  // People I follow
  const { data: following } = await supabase
    .from('follows').select('following_id').eq('follower_id', profile.id)
  if (!following?.length) return { posts: [], nextCursor: null }

  const followingIds = following.map((f: {following_id: string}) => f.following_id)

  // Of those, who also follows me back? (mutuals)
  const { data: followers } = await supabase
    .from('follows').select('follower_id').eq('following_id', profile.id)
    .in('follower_id', followingIds)

  const mutualIds = (followers || []).map((f: {follower_id: string}) => f.follower_id)
  if (!mutualIds.length) return { posts: [], nextCursor: null }

  let query = supabase
    .from('posts')
    .select(`
      id, body, post_type, likes_count, dislikes_count, comments_count, reposts_count,
      bookmarks_count, impressions_count, link_clicks_count, detail_expands_count, video_views_count, video_completions_count, created_at, edited_at, is_sensitive, quoted_post_id,
      author:users!posts_user_id_fkey(
        id, username, display_name, avatar_url, verification_tier, is_monetised
      ),
      media:post_media(id, media_type, url, thumbnail_url, width, height, position)
    `)
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
    .select(`
      id, body, post_type, likes_count, dislikes_count, comments_count, reposts_count,
      bookmarks_count, impressions_count, link_clicks_count, detail_expands_count, video_views_count, video_completions_count, created_at, edited_at, is_sensitive, quoted_post_id,
      author:users!posts_user_id_fkey(
        id, username, display_name, avatar_url, verification_tier, is_monetised
      ),
      media:post_media(id, media_type, url, thumbnail_url, width, height, position)
    `)
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
    : page.map(p => ({ ...p, is_liked: false, is_disliked: false, is_reposted: false, is_bookmarked: false }))

  return { posts: hydrated, nextCursor }
}

// ─── Bookmarked posts ─────────────────────────────────────────────────────────

export async function getBookmarkedPostsAction(cursor?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { posts: [], nextCursor: null }

  const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return { posts: [], nextCursor: null }

  let query = supabase
    .from('bookmarks')
    .select(`
      post:posts(
        id, body, post_type, likes_count, dislikes_count, comments_count, reposts_count,
        bookmarks_count, impressions_count, link_clicks_count, detail_expands_count, video_views_count, video_completions_count, created_at, edited_at, is_sensitive, quoted_post_id,
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
  const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  const page = pageRows.map((r: any) => r.post).filter(Boolean) as any[]
  const nextCursor = hasMore ? (pageRows[pageRows.length - 1] as any)?.created_at : null

  return {
    posts: page.map((p: any) => ({ ...p, is_liked: false, is_reposted: false, is_bookmarked: true })),
    nextCursor,
  }
}

// ─── Profile tab feed ─────────────────────────────────────────────────────────
// Loads posts for a specific profile + tab (posts / replies / media / likes)
// with engagement state hydrated for the current viewer.

export async function getProfileTabAction(
  profileUserId: string,
  tab: 'posts' | 'replies' | 'media' | 'likes',
  cursor?: string
): Promise<{ posts: FeedPost[]; nextCursor: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const viewer = user
    ? (await supabase.from('users').select('id').eq('auth_id', user.id).single()).data
    : null

  const BASE_SELECT = `
    id, body, post_type, likes_count, dislikes_count, comments_count, reposts_count,
    bookmarks_count, impressions_count, link_clicks_count, detail_expands_count, video_views_count, video_completions_count, created_at, edited_at, is_sensitive, quoted_post_id,
    author:users!posts_user_id_fkey(
      id, username, display_name, avatar_url, verification_tier, is_monetised
    ),
    media:post_media(id, media_type, url, thumbnail_url, width, height, position)
  `

  // media tab uses !inner to only return posts that have at least one media row
  const MEDIA_SELECT = `
    id, body, post_type, likes_count, dislikes_count, comments_count, reposts_count,
    bookmarks_count, impressions_count, link_clicks_count, detail_expands_count, video_views_count, video_completions_count, created_at, edited_at, is_sensitive, quoted_post_id,
    author:users!posts_user_id_fkey(
      id, username, display_name, avatar_url, verification_tier, is_monetised
    ),
    media:post_media!inner(id, media_type, url, thumbnail_url, width, height, position)
  `

  let rawPosts: any[] = []
  let hasMore = false

  if (tab === 'likes') {
    let q = supabase
      .from('likes')
      .select(`post:posts(${BASE_SELECT})`)
      .eq('user_id', profileUserId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1)
    if (cursor) q = q.lt('created_at', cursor)
    const { data } = await q
    const rows = data || []
    hasMore = rows.length > PAGE_SIZE
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows
    rawPosts = page.map((r: any) => r.post).filter(Boolean)
  } else {
    let q = supabase
      .from('posts')
      .select(tab === 'media' ? MEDIA_SELECT : BASE_SELECT)
      .eq('user_id', profileUserId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1)

    if (tab === 'posts') {
      q = q.is('parent_post_id', null).neq('post_type', 'repost')
    } else if (tab === 'replies') {
      q = q.not('parent_post_id', 'is', null)
    }
    // media: no extra filter — !inner join handles it

    if (cursor) q = q.lt('created_at', cursor)
    const { data } = await q
    const rows = data || []
    hasMore = rows.length > PAGE_SIZE
    rawPosts = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  }

  const nextCursor = hasMore ? rawPosts[rawPosts.length - 1]?.created_at ?? null : null

  const hydrated = viewer
    ? await hydrateEngagement(supabase, viewer.id, rawPosts)
    : rawPosts.map(p => ({ ...p, is_liked: false, is_disliked: false, is_reposted: false, is_bookmarked: false }))

  return { posts: hydrated as FeedPost[], nextCursor }
}

// ─── Profile mutuals list ─────────────────────────────────────────────────────
// Returns users who mutually follow each other with the given profile user.
// Used by the "Mutuals" tab on profile pages.

export interface MutualUser {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  verification_tier: string
  followers_count: number
  is_monetised: boolean
}

export async function getProfileMutualsAction(profileUserId: string): Promise<MutualUser[]> {
  const supabase = await createClient()

  // Everyone profileUser follows
  const { data: following } = await supabase
    .from('follows').select('following_id').eq('follower_id', profileUserId)
  if (!following?.length) return []

  const followingIds = following.map((f: { following_id: string }) => f.following_id)

  // Of those, who also follows profileUser back?
  const { data: mutualFollows } = await supabase
    .from('follows').select('follower_id')
    .eq('following_id', profileUserId)
    .in('follower_id', followingIds)
  if (!mutualFollows?.length) return []

  const mutualIds = mutualFollows.map((f: { follower_id: string }) => f.follower_id)

  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, verification_tier, followers_count, is_monetised')
    .in('id', mutualIds)
    .is('deleted_at', null)
    .order('followers_count', { ascending: false })
    .limit(50)

  return (users || []) as MutualUser[]
}

// ─── Internal: batch-hydrate like/repost/bookmark state ──────────────────────

async function hydrateEngagement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  posts: any[]
): Promise<FeedPost[]> {
  if (!posts.length) return []
  const ids = posts.map(p => p.id)

  // Collect quoted_post_ids that need hydrating (quote posts + reposts)
  const quotedIds = [...new Set(
    posts.map(p => p.quoted_post_id).filter(Boolean)
  )] as string[]

  const [{ data: likes }, { data: dislikes }, { data: bookmarks }, { data: reposts }, { data: quotedPosts }] = await Promise.all([
    supabase.from('likes').select('post_id').eq('user_id', userId).in('post_id', ids),
    supabase.from('dislikes').select('post_id').eq('user_id', userId).in('post_id', ids),
    supabase.from('bookmarks').select('post_id').eq('user_id', userId).in('post_id', ids),
    supabase.from('posts').select('quoted_post_id').eq('user_id', userId).eq('post_type', 'repost').in('quoted_post_id', ids),
    quotedIds.length
      ? supabase.from('posts').select(`
          id, body, created_at,
          author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier),
          media:post_media(id, media_type, url, thumbnail_url, width, height, position)
        `).in('id', quotedIds)
      : Promise.resolve({ data: [] }),
  ])

  const likedSet = new Set((likes || []).map((l: {post_id: string}) => l.post_id))
  const dislikedSet = new Set((dislikes || []).map((d: {post_id: string}) => d.post_id))
  const bookmarkedSet = new Set((bookmarks || []).map((b: {post_id: string}) => b.post_id))
  const repostedSet = new Set((reposts || []).map((r: {quoted_post_id: string}) => r.quoted_post_id))
  const quotedMap = new Map((quotedPosts || []).map((q: any) => [q.id, q]))

  return posts.map(p => ({
    ...p,
    is_liked: likedSet.has(p.id),
    is_disliked: dislikedSet.has(p.id),
    is_bookmarked: bookmarkedSet.has(p.id),
    is_reposted: repostedSet.has(p.id),
    quoted_post: p.quoted_post_id ? (quotedMap.get(p.quoted_post_id) ?? null) : null,
  }))
}