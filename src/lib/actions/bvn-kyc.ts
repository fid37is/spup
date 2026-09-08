// src/lib/actions/bvn-kyc.ts
'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'
import crypto from 'crypto'
import { revalidatePath } from 'next/cache'

// ============================================================
// Real BVN verification.
//
// This is the step that actually enforces "one person, one account" —
// phone verification (phone-kyc.ts) does not. A BVN is checked against
// a licensed KYC provider (Prembly / YouVerify / Smile ID are common
// choices for Nigerian BVN lookups), and only the resulting hash +
// provider reference are stored — never the raw BVN — for NDPR
// compliance.
//
// TODO before going live:
//   1. Pick a KYC provider and set BVN_KYC_PROVIDER_API_KEY / _URL below.
//   2. Replace `verifyBvnWithProvider()` with the real API call.
//   3. Confirm the provider's response includes a name you can compare
//      against the account's bank_account_name for a match check.
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

// Placeholder — swap for your chosen provider's real API call.
async function verifyBvnWithProvider(bvn: string): Promise<
  { valid: true; verificationRef: string; name: string } | { valid: false; reason: string }
> {
  if (!process.env.BVN_KYC_PROVIDER_API_KEY) {
    throw new Error(
      'BVN_KYC_PROVIDER_API_KEY is not set — no KYC provider is wired up yet. ' +
      'This must be configured before BVN verification can go live.'
    )
  }

  // Example shape for a provider call — replace with the real request:
  //
  // const res = await fetch('https://api.<provider>.com/v1/bvn/lookup', {
  //   method: 'POST',
  //   headers: {
  //     Authorization: `Bearer ${process.env.BVN_KYC_PROVIDER_API_KEY}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({ bvn }),
  // })
  // const data = await res.json()
  // if (!data.status) return { valid: false, reason: data.message }
  // return { valid: true, verificationRef: data.reference, name: data.data.full_name }

  throw new Error('verifyBvnWithProvider() is a placeholder — wire up the real provider call.')
}

// ─── Verify BVN and lock it to this account ────────────────────────────────────

export async function verifyBvnAction(bvn: string) {
  const parsed = bvnSchema.safeParse({ bvn })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('users')
    .select('id, phone_verified, bvn_verified, verification_tier, display_name')
    .eq('auth_id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }
  if (!profile.phone_verified) {
    return { error: 'Verify your phone number first.' }
  }
  if (profile.bvn_verified) {
    return { error: 'BVN already verified on this account.' }
  }

  let result
  try {
    result = await verifyBvnWithProvider(bvn)
  } catch (err) {
    console.error('BVN provider error:', err)
    return { error: 'BVN verification is temporarily unavailable. Please try again shortly.' }
  }

  if (!result.valid) {
    return { error: `BVN could not be verified: ${result.reason}` }
  }

  const bvnHash = hashBvn(bvn)

  // Admin client needed: the unique index on bvn_hash means a duplicate
  // attempt must surface a clean error, not a generic 500.
  const admin = createAdminClient()

  const updates: Record<string, unknown> = {
    bvn_hash: bvnHash,
    bvn_verification_ref: result.verificationRef,
    bvn_verified: true,
  }

  // The "standard" verification_tier is what the profile badge component
  // (verified-badge.tsx) labels "BVN Verified" — so it should follow
  // automatically from a real BVN check, not require a separate manual
  // admin-approved verification_requests submission. Only bump from 'none':
  // never downgrade someone who already holds 'creator' or 'organisation'.
  if (profile.verification_tier === 'none') {
    updates.verification_tier = 'standard'
  }

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
        details: { attempted_verification_ref: result.verificationRef },
      })
      return { error: 'This BVN is already linked to another Spup account.' }
    }
    return { error: 'BVN verified but failed to update profile. Contact support.' }
  }

  // Badge should show immediately, not after the next cache window.
  revalidatePath('/profile')

  return { success: true }
}
