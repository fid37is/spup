// src/lib/actions/monetisation.ts
'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'

// ============================================================
// Monetisation opt-in.
//
// Deliberately independent of phone/BVN verification — KYC stays
// deferred until withdrawal (see bvn-kyc.ts, paystack/initiate).
// A user can meet these growth criteria and start monetisation
// with zero KYC done; they'll only be asked for BVN once they
// actually try to withdraw.
//
// Gating earnings on is_monetised (rather than crediting from
// day one) also raises the cost of running fake accounts purely
// to farm ad revenue — see ads/serve/route.ts.
// ============================================================

const REQUIRED_ACCOUNT_AGE_DAYS = 90
const REQUIRED_FOLLOWERS = 500
const REQUIRED_POSTS = 100

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

  const accountAgeDays = Math.floor(
    (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)
  )

  const criteria = {
    account_age: { met: accountAgeDays >= REQUIRED_ACCOUNT_AGE_DAYS, value: accountAgeDays, required: REQUIRED_ACCOUNT_AGE_DAYS },
    followers:   { met: profile.followers_count >= REQUIRED_FOLLOWERS, value: profile.followers_count, required: REQUIRED_FOLLOWERS },
    posts:       { met: profile.posts_count >= REQUIRED_POSTS, value: profile.posts_count, required: REQUIRED_POSTS },
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

  const accountAgeDays = Math.floor(
    (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)
  )

  if (accountAgeDays < REQUIRED_ACCOUNT_AGE_DAYS
    || profile.followers_count < REQUIRED_FOLLOWERS
    || profile.posts_count < REQUIRED_POSTS) {
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
    posts_at_apply: profile.posts_count,
    reviewed_at: now,
  })

  const { error: updateError } = await admin
    .from('users')
    .update({ is_monetised: true, monetised_at: now })
    .eq('id', profile.id)

  if (updateError) return { error: 'Failed to enable monetisation. Please try again.' }

  return { success: true }
}
