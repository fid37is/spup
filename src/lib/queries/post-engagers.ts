// src/lib/queries/post-engagers.ts
//
// Who reposted / quoted a post, for the "Reposted by" and "Quotes" pages
// (post/[id]/activity/reposts and .../quotes). Same approach as post-likers.ts:
// plain queries instead of embedded joins, failures logged, and every person
// comes back with
//   is_following - the viewer follows them
//   follows_me   - they follow the viewer (-> the button reads "Follow back")

import { createAdminClient } from '@/lib/supabase/server'

// Reads use the service-role client on purpose. The people who liked/reposted a post
// are public information, but the user-scoped client is subject to row-level
// security, and with it this list only ever came back with the viewer's OWN row
// (so the post owner saw only themselves). Everything is still scoped to one
// post, deleted/banned accounts are excluded here, and the page itself already
// requires a signed-in viewer.

export interface PostPerson {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  verification_tier: string | null
  followers_count: number | null
  is_following: boolean
  follows_me: boolean
}

export interface PostQuote {
  id: string
  body: string | null
  created_at: string
  likes_count: number | null
  author: PostPerson
}

type Supa = ReturnType<typeof createAdminClient>

async function loadPeople(supabase: Supa, ids: string[], viewerAuthId: string | null): Promise<Map<string, PostPerson>> {
  const out = new Map<string, PostPerson>()
  if (ids.length === 0) return out

  const { data: users, error } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, verification_tier, followers_count')
    .in('id', ids)
    .is('deleted_at', null)
    .neq('status', 'banned')
  if (error) { console.error('[post-engagers] users query failed:', error.message); return out }

  let following = new Set<string>()
  let followsMe = new Set<string>()
  if (viewerAuthId) {
    const { data: viewer } = await supabase.from('users').select('id').eq('auth_id', viewerAuthId).maybeSingle()
    if (viewer) {
      const [iFollow, theyFollow] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', viewer.id).in('following_id', ids),
        supabase.from('follows').select('follower_id').eq('following_id', viewer.id).in('follower_id', ids),
      ])
      following = new Set((iFollow.data ?? []).map(f => f.following_id as string))
      followsMe = new Set((theyFollow.data ?? []).map(f => f.follower_id as string))
    }
  }

  for (const u of users ?? []) {
    out.set(u.id as string, {
      ...(u as Omit<PostPerson, 'is_following' | 'follows_me'>),
      is_following: following.has(u.id as string),
      follows_me: followsMe.has(u.id as string),
    })
  }
  return out
}

export async function getPostRepostersList(
  postId: string, viewerAuthId: string | null, sort: 'recent' | 'top' = 'recent', limit = 50,
): Promise<PostPerson[]> {
  const supabase = createAdminClient()
  const { data: rows, error } = await supabase
    .from('posts')
    .select('user_id, created_at')
    .eq('quoted_post_id', postId)
    .eq('post_type', 'repost')
    .is('deleted_at', null)
    .lte('created_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) { console.error('[getPostRepostersList] query failed:', error.message); return [] }

  const ids = [...new Set((rows ?? []).map(r => r.user_id as string))]
  const people = await loadPeople(supabase, ids, viewerAuthId)
  let list = ids.map(id => people.get(id)).filter((p): p is PostPerson => !!p)   // newest first
  if (sort === 'top') list = [...list].sort((a, b) => (b.followers_count || 0) - (a.followers_count || 0))
  return list
}

export async function getPostQuotesList(
  postId: string, viewerAuthId: string | null, sort: 'recent' | 'top' = 'recent', limit = 50,
): Promise<PostQuote[]> {
  const supabase = createAdminClient()
  const { data: rows, error } = await supabase
    .from('posts')
    .select('id, body, created_at, likes_count, user_id')
    .eq('quoted_post_id', postId)
    .eq('post_type', 'quote')
    .is('deleted_at', null)
    .lte('created_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) { console.error('[getPostQuotesList] query failed:', error.message); return [] }

  const ids = [...new Set((rows ?? []).map(r => r.user_id as string))]
  const people = await loadPeople(supabase, ids, viewerAuthId)

  let quotes: PostQuote[] = []
  for (const r of rows ?? []) {
    const author = people.get(r.user_id as string)
    if (author) quotes.push({ id: r.id as string, body: r.body as string | null, created_at: r.created_at as string, likes_count: r.likes_count as number | null, author })
  }
  if (sort === 'top') quotes = [...quotes].sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0))
  return quotes
}