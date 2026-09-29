// src/lib/actions/monetisation.ts
'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'

// ============================================================
// Monetisation opt-in.
//
// Deliberately independent of phone/NIN verification — KYC stays
// deferred until withdrawal (see nin-kyc.ts, paystack/initiate).
// A user can meet these growth criteria and start monetisation
// with zero KYC done; they'll only be asked for NIN once they
// actually try to withdraw (and BVN too, on top of that, only if
// the withdrawal is large — see lib/constants.ts).
//
// Gating earnings on is_monetised (rather than crediting from
// day one) also raises the cost of running fake accounts purely
// to farm ad revenue — see ads/serve/route.ts.
// ============================================================

const REQUIRED_ACCOUNT_AGE_DAYS = 90
const REQUIRED_FOLLOWERS = 500
const REQUIRED_POSTS = 100

// users.posts_count is bumped on every post insert - top-level posts,
// replies, and reposts alike (see createPostAction) - because it's also the
// public "X posts" activity stat shown on profile pages, where that's the
// right thing to count. Monetisation is meant to reward original content
// though, so a reply-heavy account shouldn't be able to clear "100 posts"
// without 100 actual top-level posts. This recounts straight from the
// `posts` table with that narrower filter instead of trusting the
// denormalised, broader counter.
async function countEligiblePosts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<number> {
  const { count } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('parent_post_id', null)
    .neq('post_type', 'repost')
    .is('deleted_at', null)
    .lte('created_at', new Date().toISOString())
  return count ?? 0
}

export async function getMonetisationEligibility() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('users')
    .select('id, followers_count, posts_count, created_at, is_monetised, monetised_at, status')
    .eq('auth_id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const eligiblePostsCount = await countEligiblePosts(supabase, profile.id)

  const accountAgeDays = Math.floor(
    (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)
  )

  const criteria = {
    account_age: { met: accountAgeDays >= REQUIRED_ACCOUNT_AGE_DAYS, value: accountAgeDays, required: REQUIRED_ACCOUNT_AGE_DAYS },
    followers:   { met: profile.followers_count >= REQUIRED_FOLLOWERS, value: profile.followers_count, required: REQUIRED_FOLLOWERS },
    posts:       { met: eligiblePostsCount >= REQUIRED_POSTS, value: eligiblePostsCount, required: REQUIRED_POSTS },
  }

  const allMet = Object.values(criteria).every(c => c.met)

  return {
    is_monetised: profile.is_monetised,
    monetised_at: profile.monetised_at,
    eligible_to_accept: allMet && !profile.is_monetised && profile.status === 'active',
    criteria,
  }
}

// ─── User explicitly accepts monetisation once eligible ───────────────────────
// This is the moment they should also be shown/asked to accept the fair use
// policy — pass `accepted_fair_use: true` once that's wired into the UI.

export async function acceptMonetisationAction({ accepted_fair_use }: { accepted_fair_use: boolean }) {
  if (!accepted_fair_use) {
    return { error: 'You must accept the fair use policy to enable monetisation.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('users')
    .select('id, followers_count, posts_count, created_at, is_monetised, status')
    .eq('auth_id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }
  if (profile.is_monetised) return { error: 'Monetisation is already enabled on this account.' }
  if (profile.status !== 'active') return { error: 'Your account must be in good standing to enable monetisation.' }

  const eligiblePostsCount = await countEligiblePosts(supabase, profile.id)

  const accountAgeDays = Math.floor(
    (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)
  )

  if (accountAgeDays < REQUIRED_ACCOUNT_AGE_DAYS
    || profile.followers_count < REQUIRED_FOLLOWERS
    || eligiblePostsCount < REQUIRED_POSTS) {
    return { error: 'You have not yet met all monetisation criteria.' }
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // Record the acceptance — self-approved since eligibility is verified
  // programmatically above, not manually reviewed. Keeps an audit trail
  // consistent with the existing (admin-reviewed) applications table.
  await admin.from('monetisation_applications').insert({
    user_id: profile.id,
    status: 'approved',
    followers_at_apply: profile.followers_count,
    posts_at_apply: eligiblePostsCount,
    reviewed_at: now,
  })

  const { error: updateError } = await admin
    .from('users')
    .update({ is_monetised: true, monetised_at: now })
    .eq('id', profile.id)

  if (updateError) return { error: 'Failed to enable monetisation. Please try again.' }

  return { success: true }
}