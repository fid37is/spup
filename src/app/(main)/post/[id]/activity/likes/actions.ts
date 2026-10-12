'use server'

// Next page of the people who liked a post (see likers-list.tsx).

import { createClient } from '@/lib/supabase/server'
import { getPostLikers, type PostLiker } from '@/lib/queries/posts'

export async function loadMoreLikersAction(
  postId: string,
  sort: 'recent' | 'top',
  offset: number,
): Promise<{ likers: PostLiker[]; nextOffset: number; hasMore: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { likers: [], nextOffset: offset, hasMore: false }

  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0
  return getPostLikers(postId, user.id, sort === 'top' ? 'top' : 'recent', safeOffset)
}
