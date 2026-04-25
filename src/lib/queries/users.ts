/**
 * queries/users.ts
 * ----------------
 * Pure read functions for user/profile data.
 * All functions are server-side only (use Next.js server context).
 */

import { createClient, createAdminClient } from '@/lib/supabase/server'

// ─── Profile by username ──────────────────────────────────────────────────────

export async function getProfileByUsername(username: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select(`
      id, username, display_name, bio, avatar_url, banner_url,
      website_url, location, followers_count, following_count,
      posts_count, verification_tier, is_monetised, is_private,
      created_at, status
    `)
    .eq('username', username.toLowerCase())
    .is('deleted_at', null)
    .single()

  return data
}

// ─── Profile by auth_id ───────────────────────────────────────────────────────
// Used in layouts — must always return the profile regardless of RLS.
// Uses admin client so newly-verified users aren't blocked by RLS edge cases.

export async function getProfileByAuthId(authId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('users')
    .select('*')
    .eq('auth_id', authId)
    .is('deleted_at', null)
    .single()

  return data
}

// ─── Onboarding progress ──────────────────────────────────────────────────────
// Called from (main)/layout.tsx to gate access to the app.
// MUST use admin client — RLS on onboarding_progress may block the read if
// the user's session cookie hasn't fully propagated after OTP verification,
// causing completed users to be incorrectly redirected back to /onboarding.

export async function getOnboardingProgress(userId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('onboarding_progress')
    .select('*')
    .eq('user_id', userId)
    .single()

  return data
}

// ─── Followers list ───────────────────────────────────────────────────────────

export async function getFollowers(userId: string, limit = 50) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('follows')
    .select(`follower:users!follows_follower_id_fkey(
      id, username, display_name, avatar_url, verification_tier, followers_count
    )`)
    .eq('following_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data || []).map((r: any) => r.follower).filter(Boolean)
}

// ─── Following list ───────────────────────────────────────────────────────────

export async function getFollowing(userId: string, limit = 50) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('follows')
    .select(`following:users!follows_following_id_fkey(
      id, username, display_name, avatar_url, verification_tier, followers_count
    )`)
    .eq('follower_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data || []).map((r: any) => r.following).filter(Boolean)
}

// ─── Search users ─────────────────────────────────────────────────────────────

export async function searchUsers(query: string, limit = 20) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, verification_tier, followers_count, bio')
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .is('deleted_at', null)
    .neq('status', 'banned')
    .order('followers_count', { ascending: false })
    .limit(limit)

  return data || []
}

// ─── Suggested accounts to follow ────────────────────────────────────────────

export async function getSuggestedUsers(excludeIds: string[], limit = 5) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, verification_tier, is_monetised, followers_count')
    .not('id', 'in', `(${excludeIds.join(',')})`)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('followers_count', { ascending: false })
    .limit(limit)

  return data || []
}