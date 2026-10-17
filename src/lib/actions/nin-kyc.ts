// src/lib/actions/nin-kyc.ts
'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'
import crypto from 'crypto'
import { revalidatePath } from 'next/cache'
import { verifyWithDojah } from '@/lib/kyc/dojah'
import { claimKycAttempt, releaseKycAttempt, KYC_MAX_ATTEMPTS } from '@/lib/kyc/attempts'
import { isPremiumActive } from '@/lib/premium'

// ============================================================
// Real NIN verification.
//
// NIN (National Identification Number) is the baseline identity check
// for Spup — it's what earns the "Verified" badge and what's required
// before any withdrawal or before selling via escrow. This mirrors
// bvn-kyc.ts almost exactly; BVN itself still exists, but only as an
// additional check for large-sum withdrawals (see
// app/api/paystack/initiate/route.ts, lib/constants.ts).
//
// A NIN is checked against a licensed KYC provider (Prembly / YouVerify
// / Smile ID / dojah.io etc. all support NIMC NIN lookups), and only
// the resulting hash + provider reference are stored — never the raw
// NIN — for NDPR compliance.
//
// Provider: Dojah (see lib/kyc/dojah.ts) — NIN/BVN number + selfie match.
// Gate: active Spup Premium is required to start (lib/premium.ts); verification
// is permanent afterwards. Tries are capped (lib/kyc/attempts.ts); provider
// outages hand the try back.
// ============================================================

const ninSchema = z.object({
  nin: z.string().regex(/^\d{11}$/, 'NIN must be exactly 11 digits'),
})

function hashNin(nin: string): string {
  // Hash, never store raw. Pepper via env var so a DB leak alone can't be
  // brute-forced against the small (11-digit numeric) NIN keyspace.
  return crypto
    .createHash('sha256')
    .update(nin + (process.env.NIN_HASH_PEPPER || ''))
    .digest('hex')
}

// ─── Verify NIN and lock it to this account ────────────────────────────────────

export async function verifyNinAction(nin: string, selfieBase64: string) {
  if (typeof selfieBase64 !== 'string' || selfieBase64.length < 1_000 || selfieBase64.length > 900_000) {
    return { error: 'Please take a clear selfie to continue.' }
  }
  // Accept either raw base64 or a data URL; Dojah wants raw base64.
  const selfie = selfieBase64.replace(/^data:image\/\w+;base64,/, '')

  const parsed = ninSchema.safeParse({ nin })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('users')
    .select('id, phone_verified, nin_verified, verification_tier, is_pioneer, display_name')
    .eq('auth_id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }
  if (!profile.phone_verified) {
    return { error: 'Verify your phone number first.' }
  }
  if (profile.nin_verified) {
    return { error: 'NIN already verified on this account.' }
  }

  // Premium first: verification can only be STARTED while subscribed. Once
  // verified it is permanent and never depends on Premium again.
  if (!(await isPremiumActive(profile.id))) {
    return {
      error: 'Spup Premium is required to verify. Subscribe first. Your verification stays even if Premium ends later.',
      premium_required: true,
    }
  }

  // Every lookup costs Spup money, so tries are capped (atomic claim, so two
  // taps can't spend the same try twice).
  const claim = await claimKycAttempt(profile.id, 'nin')
  if (!claim.ok) {
    return {
      error: `You've used all ${KYC_MAX_ATTEMPTS} verification tries for now. They reset 30 days after your first try.`,
      limit_reached: true,
      attempts_left: 0,
    }
  }

  const result = await verifyWithDojah('nin', nin, selfie)

  if (result.status === 'unavailable') {
    // Our side failed (provider down / our provider wallet empty / misconfigured).
    // The user must never lose a paid attempt to that.
    await releaseKycAttempt(claim.attemptId)
    return { error: 'NIN verification is temporarily unavailable. This did not use up one of your tries — please try again shortly.' }
  }

  if (result.status === 'rejected') {
    const left = claim.attemptsLeft
    return {
      error: left > 0
        ? `${result.reason} You have ${left} ${left === 1 ? 'try' : 'tries'} left this month.`
        : `${result.reason} That was your last try for now. They reset 30 days after your first try.`,
      attempts_left: left,
      limit_reached: left === 0,
    }
  }

  const ninHash = hashNin(nin)

  // Admin client needed: the unique index on nin_hash means a duplicate
  // attempt must surface a clean error, not a generic 500.
  const admin = createAdminClient()

  const updates: Record<string, unknown> = {
    nin_hash: ninHash,
    nin_verification_ref: claim.attemptId,
    nin_verified: true,
  }

  // The "standard" verification_tier is what the profile badge component
  // (verified-badge.tsx) labels "NIN Verified" — so it should follow
  // automatically from a real NIN check, not require a separate manual
  // admin-approved verification_requests submission. Only bump from 'none':
  // never downgrade someone who already holds 'creator' or 'organisation'.
  //
  // One of the first 200 people to ever create a Spup account gets the
  // gold "pioneer" tier instead of the ordinary green "standard" one, at
  // this exact moment — completing phone + NIN verification — rather
  // than at signup, so the badge also rewards actually finishing KYC.
  if (profile.verification_tier === 'none') {
    updates.verification_tier = profile.is_pioneer ? 'pioneer' : 'standard'
  }

  const { error: updateError } = await admin
    .from('users')
    .update(updates)
    .eq('id', profile.id)

  if (updateError) {
    // Postgres unique_violation
    if (updateError.code === '23505') {
      // Flag rather than silently reject — same pattern as the BVN duplicate
      // check, and worth a human looking at it.
      await admin.from('fraud_flags').insert({
        user_id: profile.id,
        flag_type: 'duplicate_nin_attempt',
        details: { attempted_verification_ref: claim.attemptId },
      })
      return { error: 'This NIN is already linked to another Spup account.' }
    }
    // Our DB failed, not the user — hand the attempt back so they can retry free.
    await releaseKycAttempt(claim.attemptId)
    return { error: 'NIN verified but failed to update profile. Contact support.' }
  }

  // Badge should show immediately, not after the next cache window.
  revalidatePath('/profile')

  return { success: true }
}
