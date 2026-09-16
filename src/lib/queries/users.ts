/**
 * queries/users.ts
 * ----------------
 * Pure read functions for user/profile data.
 * All functions are server-side only (use Next.js server context).
 */

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sanitizeFilterTerm } from '@/lib/utils'

// ─── Profile by username ──────────────────────────────────────────────────────

export async function getProfileByUsername(username: string) {
  // Use admin client — bypasses RLS so private accounts and
  // follow state checks work correctly on public profile pages
  const admin = createAdminClient()
  const { data } = await admin
    .from('users')
    .select(`
      id, username, display_name, bio, avatar_url, banner_url,
      website_url, location, followers_count, following_count,
      posts_count, verification_tier, is_monetised, is_private,
      bvn_verified, created_at, status
    `)
    .eq('username', username.toLowerCase())
    .is('deleted_at', null)
    .maybeSingle()

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
  const term = sanitizeFilterTerm(query)
  const { data } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, verification_tier, followers_count, bio')
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .is('deleted_at', null)
    .neq('status', 'banned')
    .order('followers_count', { ascending: false })
    .limit(limit)

  return data || []
}

// ─── Suggested accounts to follow ────────────────────────────────────────────
// "Who to follow" (sidebar + explore) used to be a single query sorted by
// followers_count desc — which means a brand-new account with 0 followers
// could never surface as long as `limit` other accounts had at least 1
// follower. That's most accounts, most of the time, so new users were
// effectively invisible and had no way to get their first follow.
//
// Instead this reserves roughly half the slots for the newest accounts
// (so they get discovered) and fills the rest with the most-followed
// accounts (so the list still has recognisable names), then interleaves
// the two so a new account isn't always buried at the bottom.

const SELECT_FIELDS = 'id, username, display_name, avatar_url, verification_tier, is_monetised, followers_count, bio'

export async function getSuggestedUsers(excludeIds: string[], limit = 5) {
  const supabase = await createClient()
  const notInFilter = excludeIds.length ? `(${excludeIds.join(',')})` : null
  const newSlots = Math.ceil(limit / 2)
  const popularSlots = limit - newSlots

  const baseQuery = () => {
    let q = supabase
      .from('users')
      .select(SELECT_FIELDS)
      .eq('status', 'active')
      .is('deleted_at', null)
    if (notInFilter) q = q.not('id', 'in', notInFilter)
    return q
  }

  const [{ data: newest }, { data: popular }] = await Promise.all([
    baseQuery().order('created_at', { ascending: false }).limit(newSlots * 3),
    baseQuery().order('followers_count', { ascending: false }).limit(popularSlots * 3),
  ])

  const seen = new Set<string>()
  const picked: any[] = []

  // Interleave: new, popular, new, popular... so new accounts aren't
  // pushed to the bottom of a short list nobody scrolls to.
  const newRows = (newest || []).filter(r => !seen.has(r.id))
  const popularRows = (popular || []).filter(r => !seen.has(r.id))
  let ni = 0, pi = 0
  while (picked.length < limit && (ni < newRows.length || pi < popularRows.length)) {
    if (ni < newRows.length) {
      const row = newRows[ni++]
      if (!seen.has(row.id)) { seen.add(row.id); picked.push(row) }
    }
    if (picked.length >= limit) break
    if (pi < popularRows.length) {
      const row = popularRows[pi++]
      if (!seen.has(row.id)) { seen.add(row.id); picked.push(row) }
    }
  }

  return picked.slice(0, limit)
}