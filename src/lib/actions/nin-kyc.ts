// src/lib/actions/nin-kyc.ts
'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'
import crypto from 'crypto'
import { revalidatePath } from 'next/cache'

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
// TODO before going live:
//   1. Pick a KYC provider and set NIN_KYC_PROVIDER_API_KEY / _URL below.
//   2. Replace `verifyNinWithProvider()` with the real API call.
//   3. Confirm the provider's response includes a name you can compare
//      against the account's display name for a match check.
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

// Placeholder — swap for your chosen provider's real API call.
async function verifyNinWithProvider(nin: string): Promise<
  { valid: true; verificationRef: string; name: string } | { valid: false; reason: string }
> {
  if (!process.env.NIN_KYC_PROVIDER_API_KEY) {
    throw new Error(
      'NIN_KYC_PROVIDER_API_KEY is not set — no KYC provider is wired up yet. ' +
      'This must be configured before NIN verification can go live.'
    )
  }

  // Example shape for a provider call — replace with the real request:
  //
  // const res = await fetch('https://api.<provider>.com/v1/nin/lookup', {
  //   method: 'POST',
  //   headers: {
  //     Authorization: `Bearer ${process.env.NIN_KYC_PROVIDER_API_KEY}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({ nin }),
  // })
  // const data = await res.json()
  // if (!data.status) return { valid: false, reason: data.message }
  // return { valid: true, verificationRef: data.reference, name: data.data.full_name }

  throw new Error('verifyNinWithProvider() is a placeholder — wire up the real provider call.')
}

// ─── Verify NIN and lock it to this account ────────────────────────────────────

export async function verifyNinAction(nin: string) {
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

  let result
  try {
    result = await verifyNinWithProvider(nin)
  } catch (err) {
    console.error('NIN provider error:', err)
    return { error: 'NIN verification is temporarily unavailable. Please try again shortly.' }
  }

  if (!result.valid) {
    return { error: `NIN could not be verified: ${result.reason}` }
  }

  const ninHash = hashNin(nin)

  // Admin client needed: the unique index on nin_hash means a duplicate
  // attempt must surface a clean error, not a generic 500.
  const admin = createAdminClient()

  const updates: Record<string, unknown> = {
    nin_hash: ninHash,
    nin_verification_ref: result.verificationRef,
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
        details: { attempted_verification_ref: result.verificationRef },
      })
      return { error: 'This NIN is already linked to another Spup account.' }
    }
    return { error: 'NIN verified but failed to update profile. Contact support.' }
  }

  // Badge should show immediately, not after the next cache window.
  revalidatePath('/profile')

  return { success: true }
}
