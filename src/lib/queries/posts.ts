/**
 * queries/posts.ts
 * ----------------
 * Pure read functions. No auth context. No mutations.
 * Called from Server Components and from feed.ts actions.
 *
 * These are safe to cache with React's cache() since they
 * don't depend on the caller's identity.
 */

import { createClient } from '@/lib/supabase'

const POST_SELECT = `
  id, body, post_type, likes_count, comments_count, reposts_count,
  bookmarks_count, impressions_count, created_at, edited_at, is_sensitive,
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
