/**
 * queries/posts.ts
 * ----------------
 * Pure read functions. No auth context. No mutations.
 * Called from Server Components and from feed.ts actions.
 *
 * These are safe to cache with React's cache() since they
 * don't depend on the caller's identity.
 */

import { createClient } from '@/lib/supabase/server'

// Scheduled posts carry a future created_at (see createPostAction) and
// shouldn't surface in any listing - including the author's own - until
// that time arrives. RLS is the actual security boundary; this mirrors it
// at the query level.
const nowIso = () => new Date().toISOString()

const POST_SELECT = `
  id, body, post_type, likes_count, comments_count, reposts_count,
  bookmarks_count, impressions_count, created_at, edited_at, is_sensitive,
  is_pinned, quoted_post_id, is_selling,
  author:users!posts_user_id_fkey(
    id, username, display_name, avatar_url, verification_tier, is_monetised
  ),
  media:post_media(id, media_type, url, thumbnail_url, width, height, position)
`

// Supabase's relation-type inference for a to-one join doesn't always
// resolve to a concrete row type in strict mode (the field can come back
// typed `never`, even though at runtime it's always a single row or null).
// Rather than re-deriving this everywhere a joined author is read, each
// query below asserts it once, right after the fetch.
type PostAuthor = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  verification_tier: string | null
  is_monetised: boolean | null
}

// ─── Single post ─────────────────────────────────────────────────────────────

export async function getPostById(postId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('id', postId)
    .is('deleted_at', null)
    .single()

  if (error || !data) return null
  return { ...data, author: data.author as unknown as PostAuthor }
}

// ─── Reply ancestor chain ──────────────────────────────────────────────────
// Walks up parent_post_id from the post being replied to, root-first, so the
// reply screen can stack "what came before" above the composer the way
// Threads does (comment, then the reply you tapped, then your reply). Capped
// at MAX_ANCESTORS - only the closest context matters, and an unbounded walk
// would make a long-nested thread a slow, endless reply screen.
const MAX_ANCESTORS = 3

export async function getReplyAncestors(replyToId: string, max = MAX_ANCESTORS) {
  const supabase = await createClient()
  type Ancestor = {
    id: string
    body: string | null
    parent_post_id: string | null
    author: { id: string; username: string; display_name: string; avatar_url: string | null }
  }
  const chain: Ancestor[] = []

  const { data: target } = await supabase
    .from('posts').select('parent_post_id').eq('id', replyToId).maybeSingle()
  let currentId: string | null = target?.parent_post_id ?? null

  for (let i = 0; i < max && currentId; i++) {
    const { data } = await supabase
      .from('posts')
      .select('id, body, parent_post_id, author:users!posts_user_id_fkey(id, username, display_name, avatar_url)')
      .eq('id', currentId).is('deleted_at', null).maybeSingle()
    if (!data || Array.isArray(data.author)) break
    chain.unshift(data as unknown as Ancestor)
    currentId = (data as unknown as Ancestor).parent_post_id
  }

  return chain
}

// ─── User's posts ─────────────────────────────────────────────────────────────

export async function getUserPosts(userId: string, limit = 20) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .is('parent_post_id', null)
    .lte('created_at', nowIso())
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  return data || []
}

// ─── User's replies ───────────────────────────────────────────────────────────

export async function getUserReplies(userId: string, limit = 20) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .not('parent_post_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  return data || []
}

// ─── User's liked posts ───────────────────────────────────────────────────────

export async function getUserLikedPosts(userId: string, limit = 20) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('likes')
    .select(`post:posts(${POST_SELECT})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data || []).map((r: any) => r.post).filter(Boolean)
}

// ─── Search posts ─────────────────────────────────────────────────────────────

export async function searchPosts(query: string, limit = 20) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .textSearch('body', query, { type: 'websearch', config: 'english' })
    .is('deleted_at', null)
    .lte('created_at', nowIso())
    .order('created_at', { ascending: false })
    .limit(limit)

  return data || []
}
// ─── Post Activity: who liked a post ────────────────────────────────────────
// Powers the dedicated "Post activity" page (post/[id]/activity) — Threads-
// style: likes/reposts/quotes counts + a sortable list of likers with their
// follower counts and follow-state relative to the viewer.

export async function getPostLikers(
  postId: string,
  viewerId: string | null,
  sort: 'recent' | 'top' = 'recent',
  limit = 30
) {
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('likes')
    .select(`
      created_at,
      user:users!likes_user_id_fkey(id, username, display_name, avatar_url, verification_tier, followers_count)
    `)
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(limit)

  let likers = (rows || [])
    .map((r: any) => r.user)
    .filter(Boolean)

  if (sort === 'top') {
    likers = [...likers].sort((a: any, b: any) => (b.followers_count || 0) - (a.followers_count || 0))
  }

  if (!viewerId || likers.length === 0) {
    return likers.map((u: any) => ({ ...u, is_following: false }))
  }

  const { data: viewer } = await supabase
    .from('users').select('id').eq('auth_id', viewerId).maybeSingle()

  if (!viewer) return likers.map((u: any) => ({ ...u, is_following: false }))

  const { data: followRows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', viewer.id)
    .in('following_id', likers.map((u: any) => u.id))

  const followingSet = new Set((followRows || []).map((f: any) => f.following_id))

  return likers.map((u: any) => ({ ...u, is_following: followingSet.has(u.id) }))
}

// ─── Post Activity: who reposted a post ─────────────────────────────────────
// Companion to getPostLikers/getPostQuoters — public, matches X/Threads
// showing who reposted. Reposts carry no body of their own (unlike quotes).

// ─── Post Activity: who quoted a post ───────────────────────────────────────
// Companion to getPostLikers/getPostReposters — public, matches X/Threads
// showing who quoted. This was accidentally dropped from a prior delivery
// when a newer round was branched from an older copy of this file before
// this function had been merged back in — restored here, alongside the
// other two, so this file is now the complete, correct version.

export async function getPostQuoters(
  postId: string,
  viewerId: string | null,
  sort: 'recent' | 'top' = 'recent',
  limit = 30
) {
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('posts')
    .select(`
      id, body, created_at, likes_count,
      author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier, followers_count)
    `)
    .eq('quoted_post_id', postId)
    .eq('post_type', 'quote')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  let quoters = (rows || []).filter((r: any) => r.author)

  if (sort === 'top') {
    quoters = [...quoters].sort((a: any, b: any) => (b.likes_count || 0) - (a.likes_count || 0))
  }

  if (!viewerId || quoters.length === 0) {
    return quoters.map((q: any) => ({ ...q, author: { ...q.author, is_following: false } }))
  }

  const { data: viewer } = await supabase
    .from('users').select('id').eq('auth_id', viewerId).maybeSingle()

  if (!viewer) return quoters.map((q: any) => ({ ...q, author: { ...q.author, is_following: false } }))

  const authorIds = quoters.map((q: any) => q.author.id)
  const { data: followRows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', viewer.id)
    .in('following_id', authorIds)

  const followingSet = new Set((followRows || []).map((f: any) => f.following_id))

  return quoters.map((q: any) => ({ ...q, author: { ...q.author, is_following: followingSet.has(q.author.id) } }))
}

export async function getPostReposters(
  postId: string,
  viewerId: string | null,
  sort: 'recent' | 'top' = 'recent',
  limit = 30
) {
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('posts')
    .select(`
      created_at,
      author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier, followers_count)
    `)
    .eq('quoted_post_id', postId)
    .eq('post_type', 'repost')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  let reposters = (rows || []).map((r: any) => r.author).filter(Boolean)

  if (sort === 'top') {
    reposters = [...reposters].sort((a: any, b: any) => (b.followers_count || 0) - (a.followers_count || 0))
  }

  if (!viewerId || reposters.length === 0) {
    return reposters.map((u: any) => ({ ...u, is_following: false }))
  }

  const { data: viewer } = await supabase
    .from('users').select('id').eq('auth_id', viewerId).maybeSingle()

  if (!viewer) return reposters.map((u: any) => ({ ...u, is_following: false }))

  const { data: followRows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', viewer.id)
    .in('following_id', reposters.map((u: any) => u.id))

  const followingSet = new Set((followRows || []).map((f: any) => f.following_id))

  return reposters.map((u: any) => ({ ...u, is_following: followingSet.has(u.id) }))
}