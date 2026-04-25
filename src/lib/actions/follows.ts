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
    revalidatePath('/feed')
    return { following: false }
  }

  const { error } = await supabase.from('follows').insert({ follower_id: profile.id, following_id: targetUserId })
  if (error?.code === '23505') return { following: true }     // unique violation = already following
  if (error) return { error: 'Could not follow. Please try again.' }

  void supabase.rpc('increment_counter', { p_table: 'users', p_column: 'following_count', p_id: profile.id, p_amount: 1 })
  void supabase.rpc('increment_counter', { p_table: 'users', p_column: 'followers_count', p_id: targetUserId, p_amount: 1 })

  // Notify target user
  void supabase.from('notifications').insert({
    recipient_id: targetUserId, actor_id: profile.id,
    type: 'new_follower', entity_id: profile.id, entity_type: 'user',
  })

  revalidatePath('/feed')
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