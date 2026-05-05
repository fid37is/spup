// src/lib/actions/follows.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, admin: createAdminClient(), profile: null }
  const admin = createAdminClient()
  // Use admin to fetch profile — avoids RLS edge cases
  const { data: profile } = await admin
    .from('users').select('id').eq('auth_id', user.id).single()
  return { supabase, admin, profile }
}

// ─── Follow / Unfollow ────────────────────────────────────────────────────────

export async function toggleFollowAction(targetUserId: string) {
  const { supabase, admin, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (profile.id === targetUserId) return { error: 'You cannot follow yourself' }

  // Use admin for the follows table read/write — bypasses RLS
  const { data: existing } = await admin
    .from('follows')
    .select('id')
    .match({ follower_id: profile.id, following_id: targetUserId })
    .maybeSingle()

  if (existing) {
    // Unfollow
    await admin.from('follows')
      .delete()
      .match({ follower_id: profile.id, following_id: targetUserId })

    // Decrement counters (fire-and-forget, SECURITY DEFINER bypasses RLS)
    void supabase.rpc('increment_counter', { p_table: 'users', p_column: 'following_count', p_id: profile.id,    p_amount: -1 })
    void supabase.rpc('increment_counter', { p_table: 'users', p_column: 'followers_count', p_id: targetUserId, p_amount: -1 })

    revalidatePath(`/user`)
    return { following: false }
  }

  // Follow
  const { error } = await admin.from('follows')
    .insert({ follower_id: profile.id, following_id: targetUserId })

  if (error?.code === '23505') return { following: true }  // already following
  if (error) return { error: `Could not follow: ${error.message}` }

  // Increment counters
  void supabase.rpc('increment_counter', { p_table: 'users', p_column: 'following_count', p_id: profile.id,    p_amount: 1 })
  void supabase.rpc('increment_counter', { p_table: 'users', p_column: 'followers_count', p_id: targetUserId, p_amount: 1 })

  // Notify the person being followed
  void admin.from('notifications').insert({
    recipient_id: targetUserId,
    actor_id:     profile.id,
    type:         'new_follower',
    entity_id:    profile.id,
    entity_type:  'user',
  })

  revalidatePath(`/user`)
  return { following: true }
}

// ─── Check follow status ──────────────────────────────────────────────────────

export async function getFollowStatusAction(targetUserId: string) {
  const { admin, profile } = await getCallerProfile()
  if (!profile) return { following: false }
  const { data } = await admin
    .from('follows').select('id')
    .match({ follower_id: profile.id, following_id: targetUserId })
    .maybeSingle()
  return { following: !!data }
}

// ─── Block / Unblock ─────────────────────────────────────────────────────────

export async function toggleBlockAction(targetUserId: string) {
  const { supabase, admin, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (profile.id === targetUserId) return { error: 'You cannot block yourself' }

  const { data: existing } = await supabase
    .from('user_blocks').select('blocker_id')
    .match({ blocker_id: profile.id, blocked_id: targetUserId })
    .maybeSingle()

  if (existing) {
    await supabase.from('user_blocks').delete()
      .match({ blocker_id: profile.id, blocked_id: targetUserId })
    return { blocked: false }
  }

  // Remove follows in both directions when blocking
  await admin.from('follows').delete()
    .or(`and(follower_id.eq.${profile.id},following_id.eq.${targetUserId}),and(follower_id.eq.${targetUserId},following_id.eq.${profile.id})`)

  await supabase.from('user_blocks')
    .insert({ blocker_id: profile.id, blocked_id: targetUserId })

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
    await supabase.from('user_mutes').delete()
      .match({ muter_id: profile.id, muted_id: targetUserId })
    return { muted: false }
  }

  await supabase.from('user_mutes')
    .insert({ muter_id: profile.id, muted_id: targetUserId })
  return { muted: true }
}