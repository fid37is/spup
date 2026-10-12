// src/lib/queries/post-likers.ts
//
// Who liked a post, for the "Liked by" page (post/[id]/activity/likes).
//
// Two plain queries instead of one embedded join: likes -> the people, then the
// viewer's follow relationships with them. Failures are logged (the old version
// swallowed them, so a problem looked exactly like "nobody liked this").
// Each person comes back with:
//   is_following - the viewer follows them
//   follows_me   - they follow the viewer (-> the button reads "Follow back")

import { createClient } from '@/lib/supabase/server'

export interface PostLiker {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  verification_tier: string | null
  followers_count: number | null
  is_following: boolean
  follows_me: boolean
}

export async function getPostLikersList(
  postId: string,
  viewerAuthId: string | null,
  sort: 'recent' | 'top' = 'recent',
  limit = 50,
): Promise<PostLiker[]> {
  const supabase = await createClient()

  const { data: likeRows, error: likesError } = await supabase
    .from('likes')
    .select('user_id, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (likesError) { console.error('[getPostLikersList] likes query failed:', likesError.message); return [] }

  const ids = [...new Set((likeRows ?? []).map(r => r.user_id as string))]
  if (ids.length === 0) return []

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, verification_tier, followers_count')
    .in('id', ids)
  if (usersError) { console.error('[getPostLikersList] users query failed:', usersError.message); return [] }

  const byId = new Map((users ?? []).map(u => [u.id as string, u]))
  let likers = ids.map(id => byId.get(id)).filter((u): u is NonNullable<typeof u> => !!u)   // keeps newest-like-first order

  if (sort === 'top') {
    likers = [...likers].sort((a, b) => (b.followers_count || 0) - (a.followers_count || 0))
  }

  let following = new Set<string>()
  let followsMe = new Set<string>()
  if (viewerAuthId && likers.length > 0) {
    const { data: viewer } = await supabase.from('users').select('id').eq('auth_id', viewerAuthId).maybeSingle()
    if (viewer) {
      const likerIds = likers.map(u => u.id as string)
      const [iFollow, theyFollow] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', viewer.id).in('following_id', likerIds),
        supabase.from('follows').select('follower_id').eq('following_id', viewer.id).in('follower_id', likerIds),
      ])
      following = new Set((iFollow.data ?? []).map(f => f.following_id as string))
      followsMe = new Set((theyFollow.data ?? []).map(f => f.follower_id as string))
    }
  }

  return likers.map(u => ({
    ...(u as Omit<PostLiker, 'is_following' | 'follows_me'>),
    is_following: following.has(u.id as string),
    follows_me: followsMe.has(u.id as string),
  }))
}