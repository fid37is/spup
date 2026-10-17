// src/lib/actions/bvn-kyc.ts
'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'
import crypto from 'crypto'
import { revalidatePath } from 'next/cache'
import { verifyWithDojah } from '@/lib/kyc/dojah'
import { claimKycAttempt, releaseKycAttempt, KYC_MAX_ATTEMPTS } from '@/lib/kyc/attempts'
import { isPremiumActive } from '@/lib/premium'

// ============================================================
// Real BVN verification — extra check for LARGE withdrawals only.
//
// NIN (see nin-kyc.ts) is now the baseline identity check: it's what
// earns the "Verified" badge and what's required before any ordinary
// withdrawal. BVN sits on top of that, required in addition to NIN
// only once a withdrawal crosses BIG_TRANSACTION_THRESHOLD_KOBO (see
// lib/constants.ts, app/api/paystack/initiate/route.ts). Most people
// never need to complete this at all.
//
// A BVN is checked against a licensed KYC provider (Prembly / YouVerify
// / Smile ID are common choices for Nigerian BVN lookups), and only
// the resulting hash + provider reference are stored — never the raw
// BVN — for NDPR compliance.
//
// Provider: Dojah (see lib/kyc/dojah.ts) — NIN/BVN number + selfie match.
// Gate: active Spup Premium is required to start (lib/premium.ts); verification
// is permanent afterwards. Tries are capped (lib/kyc/attempts.ts); provider
// outages hand the try back.
// ============================================================

const bvnSchema = z.object({
  bvn: z.string().regex(/^\d{11}$/, 'BVN must be exactly 11 digits'),
})

function hashBvn(bvn: string): string {
  // Hash, never store raw. Pepper via env var so a DB leak alone can't be
  // brute-forced against the small (11-digit numeric) BVN keyspace.
  return crypto
    .createHash('sha256')
    .update(bvn + (process.env.BVN_HASH_PEPPER || ''))
    .digest('hex')
}

// ─── Verify BVN and lock it to this account ────────────────────────────────────

export async function verifyBvnAction(bvn: string, selfieBase64: string) {
  if (typeof selfieBase64 !== 'string' || selfieBase64.length < 1_000 || selfieBase64.length > 900_000) {
    return { error: 'Please take a clear selfie to continue.' }
  }
  // Accept either raw base64 or a data URL; Dojah wants raw base64.
  const selfie = selfieBase64.replace(/^data:image\/\w+;base64,/, '')

  const parsed = bvnSchema.safeParse({ bvn })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('users')
    .select('id, phone_verified, bvn_verified, display_name')
    .eq('auth_id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }
  if (!profile.phone_verified) {
    return { error: 'Verify your phone number first.' }
  }
  if (profile.bvn_verified) {
    return { error: 'BVN already verified on this account.' }
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
  const claim = await claimKycAttempt(profile.id, 'bvn')
  if (!claim.ok) {
    return {
      error: `You've used all ${KYC_MAX_ATTEMPTS} verification tries for now. They reset 30 days after your first try.`,
      limit_reached: true,
      attempts_left: 0,
    }
  }

  const result = await verifyWithDojah('bvn', bvn, selfie)

  if (result.status === 'unavailable') {
    // Our side failed (provider down / our provider wallet empty / misconfigured).
    // The user must never lose a paid attempt to that.
    await releaseKycAttempt(claim.attemptId)
    return { error: 'BVN verification is temporarily unavailable. This did not use up one of your tries — please try again shortly.' }
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

  const bvnHash = hashBvn(bvn)

  // Admin client needed: the unique index on bvn_hash means a duplicate
  // attempt must surface a clean error, not a generic 500.
  const admin = createAdminClient()

  const updates: Record<string, unknown> = {
    bvn_hash: bvnHash,
    bvn_verification_ref: claim.attemptId,
    bvn_verified: true,
  }

  // Note: unlike NIN, BVN verification does NOT bump verification_tier —
  // the "Verified" badge is earned via NIN (see nin-kyc.ts). BVN is purely
  // the extra gate for large withdrawals and has no badge/tier effect.

  const { error: updateError } = await admin
    .from('users')
    .update(updates)
    .eq('id', profile.id)

  if (updateError) {
    // Postgres unique_violation
    if (updateError.code === '23505') {
      // Flag rather than silently reject — this is exactly the pattern the
      // fair use policy describes, and it's worth a human looking at it.
      await admin.from('fraud_flags').insert({
        user_id: profile.id,
        flag_type: 'duplicate_bvn_attempt',
        details: { attempted_verification_ref: claim.attemptId },
      })
      return { error: 'This BVN is already linked to another Spup account.' }
    }
    // Our DB failed, not the user — hand the attempt back so they can retry free.
    await releaseKycAttempt(claim.attemptId)
    return { error: 'BVN verified but failed to update profile. Contact support.' }
  }

  // Wallet's "needed before large withdrawal" banner should clear
  // immediately, not after the next cache window.
  revalidatePath('/profile')
  revalidatePath('/wallet')

  return { success: true }
}
