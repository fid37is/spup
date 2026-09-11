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

const POST_SELECT = `
  id, body, post_type, likes_count, comments_count, reposts_count,
  bookmarks_count, impressions_count, created_at, edited_at, is_sensitive,
  is_pinned, quoted_post_id,
  author:users!posts_user_id_fkey(
    id, username, display_name, avatar_url, verification_tier, is_monetised
  ),
  media:post_media(id, media_type, url, thumbnail_url, width, height, position)
`

// ─── Single post ─────────────────────────────────────────────────────────────

export async function getPostById(postId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('id', postId)
    .is('deleted_at', null)
    .single()

  if (error) return null
  return data
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

// ─── Post Activity: who quoted a post ───────────────────────────────────────
// Companion to getPostLikers — public, matches X/Threads showing who quoted.

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
