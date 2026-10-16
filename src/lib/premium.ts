// src/lib/premium.ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!
const PAYSTACK_BASE = 'https://api.paystack.co'

/** One payment = one 30-day period. Renewals stack after the current period. */
export const PREMIUM_DAYS = 30
export const PREMIUM_REFERENCE_PREFIX = 'SPUP-PREM-'

const FALLBACK_PRICE_KOBO = 250_000 // ₦2,500 — only used if the settings row is missing

/** Price is always read server-side; the client never sends an amount. */
export async function getPremiumPriceKobo(): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('platform_settings')
    .select('value')
    .eq('key', 'premium_price_kobo')
    .maybeSingle()
  const n = Number(data?.value)
  return Number.isInteger(n) && n > 0 ? n : FALLBACK_PRICE_KOBO
}

/** When the user's Premium ends, or null if they've never subscribed. May be in the past. */
export async function getPremiumUntil(userId: string): Promise<Date | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('premium_payments')
    .select('period_end')
    .eq('user_id', userId)
    .eq('status', 'paid')
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.period_end ? new Date(data.period_end) : null
}

export async function isPremiumActive(userId: string): Promise<boolean> {
  const until = await getPremiumUntil(userId)
  return !!until && until.getTime() > Date.now()
}

/**
 * Confirm a Paystack payment and activate 30 days of Premium.
 * Safe to call from the browser callback, the webhook and the status check
 * at the same time (premium_activate is idempotent and race-safe).
 * Never trusts a callback/webhook payload — always re-asks Paystack.
 */
export async function creditPremiumPayment(
  reference: string,
): Promise<{ ok: boolean; premiumUntil?: string }> {
  const admin = createAdminClient()

  const { data: row } = await admin
    .from('premium_payments')
    .select('id, amount_kobo, status, period_end')
    .eq('reference', reference)
    .maybeSingle()

  if (!row) return { ok: false }
  if (row.status === 'paid') return { ok: true, premiumUntil: row.period_end ?? undefined }
  if (row.status === 'failed') return { ok: false }

  let verify: any
  try {
    verify = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    }).then(r => r.json())
  } catch (err) {
    console.error('Premium payment verify request failed:', err)
    return { ok: false } // stays pending; retried by the status check / webhook
  }

  const paystackStatus = verify?.data?.status
  if (!verify?.status || paystackStatus !== 'success') {
    // 'abandoned' / 'ongoing' may still complete — leave pending. Only a
    // definite failure closes the row.
    if (paystackStatus === 'failed' || paystackStatus === 'reversed') {
      await admin.from('premium_payments').update({ status: 'failed' }).eq('id', row.id).eq('status', 'pending')
    }
    return { ok: false }
  }

  if (verify.data.amount !== row.amount_kobo || verify.data.currency !== 'NGN') {
    console.error(`Premium payment mismatch for ${reference}: expected ${row.amount_kobo} NGN, got ${verify.data.amount} ${verify.data.currency}`)
    await admin.from('premium_payments').update({ status: 'failed' }).eq('id', row.id).eq('status', 'pending')
    return { ok: false }
  }

  const { data: periodEnd, error } = await admin.rpc('premium_activate', {
    p_reference: reference,
    p_days: PREMIUM_DAYS,
  })
  if (error || !periodEnd) {
    console.error('premium_activate failed:', error)
    return { ok: false }
  }
  return { ok: true, premiumUntil: periodEnd as string }
}

/**
 * Gate for sending a phone OTP: unverified phones need active Premium.
 * (Already-verified users re-sending, e.g. changing number, are not blocked.)
 * Returns null when allowed, or the error payload to hand back to the page.
 */
export async function premiumGateForPhone(authId: string): Promise<{ error: string; premium_required: true } | null> {
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('id, phone_verified')
    .eq('auth_id', authId)
    .maybeSingle()
  if (!profile) return null            // the action's own profile check reports this
  if (profile.phone_verified) return null
  if (await isPremiumActive(profile.id)) return null
  return {
    error: 'Spup Premium is required to verify your phone. Subscribe first. Your verification stays even if Premium ends later.',
    premium_required: true,
  }
}
