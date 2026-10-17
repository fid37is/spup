// src/lib/kyc/attempts.ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import type { KycKind } from './dojah'

/** Provider lookups per kind, per user, per rolling window. Each one costs Spup money. */
export const KYC_MAX_ATTEMPTS = 3
export const KYC_WINDOW_DAYS = 30

export type ClaimResult =
  | { ok: true; attemptId: string; attemptsLeft: number }
  | { ok: false }

/** Take one try (atomic). ok:false = the user has used them all for this window. */
export async function claimKycAttempt(userId: string, kind: KycKind): Promise<ClaimResult> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('kyc_claim_attempt', {
    p_user_id: userId,
    p_kind: kind,
    p_max: KYC_MAX_ATTEMPTS,
    p_window_days: KYC_WINDOW_DAYS,
  })
  if (error) {
    console.error('kyc_claim_attempt failed:', error)
    return { ok: false }
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { ok: false }
  return { ok: true, attemptId: row.attempt_id, attemptsLeft: row.attempts_left }
}

/** Hand a try back — used whenever the failure wasn't the user's. */
export async function releaseKycAttempt(attemptId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.rpc('kyc_release_attempt', { p_attempt_id: attemptId })
  if (error) console.error('kyc_release_attempt failed:', error)
}

export async function kycAttemptsLeft(userId: string, kind: KycKind): Promise<number> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - KYC_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from('kyc_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', kind)
    .gte('created_at', since)
  return Math.max(0, KYC_MAX_ATTEMPTS - (count ?? 0))
}
