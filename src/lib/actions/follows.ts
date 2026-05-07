'use server'

/**
 * follows.ts — social graph mutations only.
 * follow, unfollow, block, mute.
 * Previously scattered in social.ts.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, profile: null }
  const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
  return { supabase, profile }
}

// ─── Follow / Unfollow ────────────────────────────────────────────────────────

export async function toggleFollowAction(targetUserId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (profile.id === targetUserId) return { error: 'You cannot follow yourself' }

  const { data: existing } = await supabase
    .from('follows')
    .select('id')
    .match({ follower_id: profile.id, following_id: targetUserId })
    .maybeSingle()

  if (existing) {
    await supabase.from('follows').delete().match({ follower_id: profile.id, following_id: targetUserId })
    void supabase.rpc('increment_counter', { p_table: 'users', p_column: 'following_count', p_id: profile.id, p_amount: -1 })
    void supabase.rpc('increment_counter', { p_table: 'users', p_column: 'followers_count', p_id: targetUserId, p_amount: -1 })
    return { following: false }
  }

  const { error } = await supabase.from('follows').insert({ follower_id: profile.id, following_id: targetUserId })
  if (error?.code === '23505') return { following: true }  // duplicate — already following
  if (error?.code === '42501') return { error: 'Permission denied. Please log out and back in.' }
  if (error) return { error: `Could not follow: ${error.message}` }

  void supabase.rpc('increment_counter', { p_table: 'users', p_column: 'following_count', p_id: profile.id, p_amount: 1 })
  void supabase.rpc('increment_counter', { p_table: 'users', p_column: 'followers_count', p_id: targetUserId, p_amount: 1 })
  void supabase.from('notifications').insert({
    recipient_id: targetUserId, actor_id: profile.id,
    type: 'new_follower', entity_id: profile.id, entity_type: 'user',
  })
  return { following: true }
}

// ─── Read-only: check if currently following ──────────────────────────────────

export async function getFollowStatusAction(targetUserId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { following: false }
  const { data } = await supabase
    .from('follows').select('id')
    .match({ follower_id: profile.id, following_id: targetUserId })
    .maybeSingle()
  return { following: !!data }
}

// ─── Block / Unblock ─────────────────────────────────────────────────────────

export async function toggleBlockAction(targetUserId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (profile.id === targetUserId) return { error: 'You cannot block yourself' }

  const { data: existing } = await supabase
    .from('user_blocks').select('blocker_id')
    .match({ blocker_id: profile.id, blocked_id: targetUserId })
    .maybeSingle()

  if (existing) {
    await supabase.from('user_blocks').delete().match({ blocker_id: profile.id, blocked_id: targetUserId })
    return { blocked: false }
  }

  // Remove follow in both directions when blocking
  await supabase.from('follows').delete()
    .or(`and(follower_id.eq.${profile.id},following_id.eq.${targetUserId}),and(follower_id.eq.${targetUserId},following_id.eq.${profile.id})`)

  await supabase.from('user_blocks').insert({ blocker_id: profile.id, blocked_id: targetUserId })
  revalidatePath('/feed')
  return { blocked: true }
}

// ─── Mute / Unmute ────────────────────────────────────────────────────────────

export async function toggleMuteAction(targetUserId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  const { data: existing } = await supabase
    .from('user_mutes').select('muter_id')
    .match({ muter_id: profile.id, muted_id: targetUserId })
    .maybeSingle()

  if (existing) {
    await supabase.from('user_mutes').delete().match({ muter_id: profile.id, muted_id: targetUserId })
    return { muted: false }
  }
  await supabase.from('user_mutes').insert({ muter_id: profile.id, muted_id: targetUserId })
  return { muted: true }
}
// ─── Suggested accounts for onboarding ───────────────────────────────────────
// Returns real accounts sorted by followers_count.
// If interestIds are provided, prioritises accounts whose posts use those hashtags.
// Falls back to top accounts by followers if interest matching yields < 3 results.

export async function getSuggestedAccountsAction(interestIds: string[] = []): Promise<{
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  followers_count: number
  verification_tier: string
  is_monetised: boolean
}[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get current user profile to exclude self and already-followed
  let excludeIds: string[] = []
  if (user) {
    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', user.id).single()
    if (profile) {
      excludeIds = [profile.id]
      const { data: following } = await supabase
        .from('follows').select('following_id').eq('follower_id', profile.id)
      if (following) excludeIds.push(...following.map((f: any) => f.following_id))
    }
  }

  // Try interest-based suggestions first
  if (interestIds.length > 0) {
    const { data: tags } = await supabase
      .from('hashtags').select('id').in('tag', interestIds)
    const tagIds = (tags || []).map((t: any) => t.id)

    if (tagIds.length > 0) {
      // Find authors who post about these interests
      const { data: postRows } = await supabase
        .from('post_hashtags')
        .select('post:posts(user_id)')
        .in('hashtag_id', tagIds)
        .limit(200)

      const authorIds = [...new Set(
        (postRows || [])
          .map((r: any) => r.post?.user_id)
          .filter((id: string | undefined) => id && !excludeIds.includes(id))
      )]

      if (authorIds.length >= 3) {
        let q = supabase
          .from('users')
          .select('id, username, display_name, avatar_url, bio, followers_count, verification_tier, is_monetised')
          .in('id', authorIds.slice(0, 50))
          .eq('status', 'active')
          .is('deleted_at', null)
          .order('followers_count', { ascending: false })
          .limit(8)

        const { data } = await q
        if ((data || []).length >= 3) return data as any[]
      }
    }
  }

  // Fallback: top accounts by followers
  let q = supabase
    .from('users')
    .select('id, username, display_name, avatar_url, bio, followers_count, verification_tier, is_monetised')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('followers_count', { ascending: false })
    .limit(8)

  if (excludeIds.length > 0) {
    q = q.not('id', 'in', `(${excludeIds.join(',')})`)
  }

  const { data } = await q
  return (data || []) as any[]
}