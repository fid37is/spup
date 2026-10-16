// src/lib/actions/premium.ts
'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { creditPremiumPayment, getPremiumPriceKobo, getPremiumUntil, PREMIUM_DAYS } from '@/lib/premium'
import { kycAttemptsLeft, KYC_MAX_ATTEMPTS } from '@/lib/kyc/attempts'

export type PremiumStatus =
  | { error: string }
  | {
      price_kobo: number
      days: number
      active: boolean
      premium_until: string | null   // ISO; may be in the past (= lapsed)
      phone_verified: boolean
      nin_verified: boolean
    }

export async function getPremiumStatusAction(): Promise<PremiumStatus> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('users')
    .select('id, phone_verified, nin_verified')
    .eq('auth_id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  // Self-heal: paid but closed the tab before the callback/webhook landed?
  // Re-check recent pending payments with Paystack right here.
  const admin = createAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: pending } = await admin
    .from('premium_payments')
    .select('reference')
    .eq('user_id', profile.id)
    .eq('status', 'pending')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(3)
  for (const p of pending ?? []) await creditPremiumPayment(p.reference)

  const until = await getPremiumUntil(profile.id)
  return {
    price_kobo: await getPremiumPriceKobo(),
    days: PREMIUM_DAYS,
    active: !!until && until.getTime() > Date.now(),
    premium_until: until ? until.toISOString() : null,
    phone_verified: !!profile.phone_verified,
    nin_verified: !!profile.nin_verified,
  }
}

export type KycStatus =
  | { error: string }
  | {
      premium_active: boolean
      premium_price_kobo: number
      phone_verified: boolean
      already_verified: boolean
      attempts_left: number
      max_attempts: number
    }

// What the NIN/BVN page needs on load.
export async function getKycStatusAction(kind: string): Promise<KycStatus> {
  if (kind !== 'nin' && kind !== 'bvn') return { error: 'Invalid verification type' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('users')
    .select('id, phone_verified, nin_verified, bvn_verified')
    .eq('auth_id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const until = await getPremiumUntil(profile.id)
  return {
    premium_active: !!until && until.getTime() > Date.now(),
    premium_price_kobo: await getPremiumPriceKobo(),
    phone_verified: !!profile.phone_verified,
    already_verified: kind === 'nin' ? !!profile.nin_verified : !!profile.bvn_verified,
    attempts_left: await kycAttemptsLeft(profile.id, kind),
    max_attempts: KYC_MAX_ATTEMPTS,
  }
}
