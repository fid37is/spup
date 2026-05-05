// src/lib/actions/feed.ts
'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'

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

const POST_SELECT = `
  id, body, post_type, likes_count, dislikes_count, comments_count, reposts_count,
  bookmarks_count, impressions_count, link_clicks_count, detail_expands_count,
  video_views_count, video_completions_count, created_at, edited_at, is_sensitive, quoted_post_id,
  author:users!posts_user_id_fkey(
    id, username, display_name, avatar_url, verification_tier, is_monetised
  ),
  media:post_media(id, media_type, url, thumbnail_url, width, height, position)
`.trim()

const POST_SELECT_MEDIA_INNER = `
  id, body, post_type, likes_count, dislikes_count, comments_count, reposts_count,
  bookmarks_count, impressions_count, link_clicks_count, detail_expands_count,
  video_views_count, video_completions_count, created_at, edited_at, is_sensitive, quoted_post_id,
  author:users!posts_user_id_fkey(
    id, username, display_name, avatar_url, verification_tier, is_monetised
  ),
  media:post_media!inner(id, media_type, url, thumbnail_url, width, height, position)
`.trim()

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, admin: createAdminClient(), profile: null }
  const admin = createAdminClient()
  // Use admin to fetch own profile — avoids any RLS edge cases
  const { data: profile } = await admin
    .from('users').select('id').eq('auth_id', user.id).single()
  return { supabase, admin, profile }
}

function paginate<T extends Record<string, any>>(rows: T[], pageSize = PAGE_SIZE) {
  const hasMore = rows.length > pageSize
  const page = hasMore ? rows.slice(0, pageSize) : rows
  const nextCursor = hasMore ? (page[page.length - 1] as any)?.created_at ?? null : null
  return { page, hasMore, nextCursor }
}

// ─── For You feed ─────────────────────────────────────────────────────────────

export async function getForYouFeedAction(cursor?: string): Promise<{
  posts: FeedPost[]
  nextCursor: string | null
}> {
  const { supabase, admin, profile } = await getCallerProfile()
  if (!profile) return { posts: [], nextCursor: null }

  // Exclude blocked/muted users
  const [{ data: blocks }, { data: mutes }] = await Promise.all([
    supabase.from('user_blocks').select('blocked_id').eq('blocker_id', profile.id),
    supabase.from('user_mutes').select('muted_id').eq('muter_id', profile.id),
  ])
  const excludeIds = [
    ...(blocks || []).map((b: any) => b.blocked_id),
    ...(mutes  || []).map((m: any) => m.muted_id),
  ]

  let q = supabase
    .from('posts')
    .select(POST_SELECT)
    .is('deleted_at', null)
    .is('parent_post_id', null)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (excludeIds.length) q = q.not('user_id', 'in', `(${excludeIds.join(',')})`)
  if (cursor)            q = q.lt('created_at', cursor)

  const { data: rows } = await q
  if (!rows?.length) return { posts: [], nextCursor: null }

  const { page, nextCursor } = paginate(rows as any[])
  return { posts: await hydrateEngagement(supabase, profile.id, page), nextCursor }
}

// ─── Following feed ───────────────────────────────────────────────────────────

export async function getFollowingFeedAction(cursor?: string): Promise<{
  posts: FeedPost[]
  nextCursor: string | null
}> {
  const { supabase, admin, profile } = await getCallerProfile()
  if (!profile) return { posts: [], nextCursor: null }

  // Admin client bypasses RLS on follows table
  const { data: following } = await admin
    .from('follows')
    .select('following_id')
    .eq('follower_id', profile.id)

  const followingIds = [
    profile.id,
    ...(following || []).map((f: any) => f.following_id),
  ]

  let q = supabase
    .from('posts')
    .select(POST_SELECT)
    .is('deleted_at', null)
    .is('parent_post_id', null)
    .in('user_id', followingIds)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (cursor) q = q.lt('created_at', cursor)

  const { data: rows } = await q
  if (!rows?.length) return { posts: [], nextCursor: null }

  const { page, nextCursor } = paginate(rows as any[])
  return { posts: await hydrateEngagement(supabase, profile.id, page), nextCursor }
}

// ─── Mutuals feed ─────────────────────────────────────────────────────────────

export async function getMutualsFeedAction(cursor?: string): Promise<{
  posts: FeedPost[]
  nextCursor: string | null
}> {
  const { supabase, admin, profile } = await getCallerProfile()
  if (!profile) return { posts: [], nextCursor: null }

  // Admin client bypasses RLS on follows table
  const { data: following } = await admin
    .from('follows')
    .select('following_id')
    .eq('follower_id', profile.id)

  if (!following?.length) return { posts: [], nextCursor: null }

  const followingIds = following.map((f: any) => f.following_id)

  // Who among them also follows me back?
  const { data: followers } = await admin
    .from('follows')
    .select('follower_id')
    .eq('following_id', profile.id)
    .in('follower_id', followingIds)

  const mutualIds = (followers || []).map((f: any) => f.follower_id)
  if (!mutualIds.length) return { posts: [], nextCursor: null }

  let q = supabase
    .from('posts')
    .select(POST_SELECT)
    .is('deleted_at', null)
    .is('parent_post_id', null)
    .in('user_id', mutualIds)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (cursor) q = q.lt('created_at', cursor)

  const { data: rows } = await q
  if (!rows?.length) return { posts: [], nextCursor: null }

  const { page, nextCursor } = paginate(rows as any[])
  return { posts: await hydrateEngagement(supabase, profile.id, page), nextCursor }
}

// ─── Post replies ─────────────────────────────────────────────────────────────

export async function getPostRepliesAction(postId: string, cursor?: string) {
  const { supabase, profile } = await getCallerProfile()

  let q = supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('parent_post_id', postId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(PAGE_SIZE + 1)

  if (cursor) q = q.gt('created_at', cursor)

  const { data: rows } = await q
  if (!rows?.length) return { posts: [], nextCursor: null }

  const { page, nextCursor } = paginate(rows as any[])

  const hydrated = profile
    ? await hydrateEngagement(supabase, profile.id, page)
    : page.map(p => ({ ...p, is_liked: false, is_disliked: false, is_reposted: false, is_bookmarked: false }))

  return { posts: hydrated, nextCursor }
}

// ─── Bookmarked posts ─────────────────────────────────────────────────────────

export async function getBookmarkedPostsAction(cursor?: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { posts: [], nextCursor: null }

  let q = supabase
    .from('bookmarks')
    .select(`post:posts(${POST_SELECT})`)
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (cursor) q = q.lt('created_at', cursor)

  const { data: rows } = await q
  if (!rows?.length) return { posts: [], nextCursor: null }

  const { page: pageRows, nextCursor } = paginate(rows as any[])
  const page = pageRows.map((r: any) => r.post).filter(Boolean) as any[]

  return {
    posts: page.map((p: any) => ({
      ...p,
      is_liked: false, is_disliked: false, is_reposted: false, is_bookmarked: true,
    })),
    nextCursor,
  }
}

// ─── Profile tab feed ─────────────────────────────────────────────────────────

export async function getProfileTabAction(
  profileUserId: string,
  tab: 'posts' | 'replies' | 'media' | 'likes',
  cursor?: string
): Promise<{ posts: FeedPost[]; nextCursor: string | null }> {
  const { supabase, profile: viewer } = await getCallerProfile()

  let rawPosts: any[] = []
  let hasMore = false

  if (tab === 'likes') {
    let q = supabase
      .from('likes')
      .select(`post:posts(${POST_SELECT})`)
      .eq('user_id', profileUserId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1)
    if (cursor) q = q.lt('created_at', cursor)

    const { data } = await q
    const rows = data || []
    hasMore = rows.length > PAGE_SIZE
    rawPosts = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map((r: any) => r.post).filter(Boolean)
  } else {
    const select = tab === 'media' ? POST_SELECT_MEDIA_INNER : POST_SELECT
    let q = supabase
      .from('posts')
      .select(select)
      .eq('user_id', profileUserId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1)

    if (tab === 'posts')   q = q.is('parent_post_id', null).neq('post_type', 'repost')
    if (tab === 'replies') q = q.not('parent_post_id', 'is', null)
    if (cursor)            q = q.lt('created_at', cursor)

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
  const admin = createAdminClient()

  const { data: following } = await admin
    .from('follows').select('following_id').eq('follower_id', profileUserId)
  if (!following?.length) return []

  const followingIds = following.map((f: any) => f.following_id)

  const { data: mutualFollows } = await admin
    .from('follows').select('follower_id')
    .eq('following_id', profileUserId)
    .in('follower_id', followingIds)
  if (!mutualFollows?.length) return []

  const mutualIds = mutualFollows.map((f: any) => f.follower_id)

  const { data: users } = await admin
    .from('users')
    .select('id, username, display_name, avatar_url, verification_tier, followers_count, is_monetised')
    .in('id', mutualIds)
    .is('deleted_at', null)
    .order('followers_count', { ascending: false })
    .limit(50)

  return (users || []) as MutualUser[]
}

// ─── Hydrate engagement state ─────────────────────────────────────────────────

async function hydrateEngagement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  posts: any[]
): Promise<FeedPost[]> {
  if (!posts.length) return []
  const ids = posts.map(p => p.id)

  const quotedIds = [...new Set(
    posts.map(p => p.quoted_post_id).filter(Boolean)
  )] as string[]

  // All IDs we need engagement for: the posts themselves + their quoted originals
  const allIds = [...new Set([...ids, ...quotedIds])]

  const [
    { data: likes },
    { data: dislikes },
    { data: bookmarks },
    { data: reposts },
    { data: quotedPosts },
  ] = await Promise.all([
    // Check viewer engagement across all IDs (posts + quoted originals)
    supabase.from('likes').select('post_id').eq('user_id', userId).in('post_id', allIds),
    supabase.from('dislikes').select('post_id').eq('user_id', userId).in('post_id', allIds),
    supabase.from('bookmarks').select('post_id').eq('user_id', userId).in('post_id', allIds),
    supabase.from('posts').select('quoted_post_id').eq('user_id', userId).eq('post_type', 'repost').in('quoted_post_id', allIds),
    // Fetch quoted posts with full counts so action buttons work
    quotedIds.length
      ? supabase.from('posts').select(`
          id, body, created_at, post_type,
          likes_count, dislikes_count, comments_count, reposts_count,
          bookmarks_count, impressions_count, link_clicks_count,
          detail_expands_count, video_views_count, video_completions_count,
          is_sensitive, quoted_post_id, edited_at,
          author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier, is_monetised),
          media:post_media(id, media_type, url, thumbnail_url, width, height, position)
        `).in('id', quotedIds).is('deleted_at', null)
      : Promise.resolve({ data: [] }),
  ])

  const likedSet      = new Set((likes     || []).map((l: any) => l.post_id))
  const dislikedSet   = new Set((dislikes  || []).map((d: any) => d.post_id))
  const bookmarkedSet = new Set((bookmarks || []).map((b: any) => b.post_id))
  const repostedSet   = new Set((reposts   || []).map((r: any) => r.quoted_post_id))

  // Build quoted post map with viewer engagement hydrated
  const quotedMap = new Map(
    (quotedPosts || []).map((q: any) => [
      q.id,
      {
        ...q,
        is_liked:      likedSet.has(q.id),
        is_disliked:   dislikedSet.has(q.id),
        is_bookmarked: bookmarkedSet.has(q.id),
        is_reposted:   repostedSet.has(q.id),
      },
    ])
  )

  return posts.map(p => ({
    ...p,
    is_liked:      likedSet.has(p.id),
    is_disliked:   dislikedSet.has(p.id),
    is_bookmarked: bookmarkedSet.has(p.id),
    is_reposted:   repostedSet.has(p.id),
    quoted_post:   p.quoted_post_id ? (quotedMap.get(p.quoted_post_id) ?? null) : null,
  }))
}