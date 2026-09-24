// src/lib/promotions.ts
//
// Pure, DB-free logic shared between the checkout route (redeeming a code) and
// the admin promo-code actions (generating one) - kept here, not in either of
// those files, so it's directly unit-testable and so both sides can never drift
// on what "a valid code" or "a valid tier" means.

export const TIERS = {
  boost:     { price_kobo: 50_000,  duration_hours: 24,  label: 'Boost (1 day)' },
  spotlight: { price_kobo: 200_000, duration_hours: 72,  label: 'Spotlight (3 days)' },
  feature:   { price_kobo: 500_000, duration_hours: 168, label: 'Feature (7 days)' },
} as const

export type Tier = keyof typeof TIERS

export function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && value in TIERS
}

// ── Promo codes ────────────────────────────────────────────────────────────────
//
// A code is redeemable when: it exists, hasn't been revoked, hasn't expired,
// still has uses left, and - if it was generated for one specific tier - the
// promotion being requested is that tier. A code with no tier set works for any
// tier (a general-purpose comp/affiliate code).

export interface PromoCodeRow {
  id: string
  code: string
  tier: string | null
  max_uses: number
  times_used: number
  status: 'active' | 'revoked'
  expires_at: string | null
}

export type PromoCodeCheck =
  | { ok: true; tier: string | null }
  | { ok: false; reason: 'not_found' | 'revoked' | 'expired' | 'exhausted' | 'tier_mismatch' }

export function checkPromoCode(row: PromoCodeRow | null, requestedTier: Tier, now: Date = new Date()): PromoCodeCheck {
  if (!row) return { ok: false, reason: 'not_found' }
  if (row.status !== 'active') return { ok: false, reason: 'revoked' }
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) return { ok: false, reason: 'expired' }
  if (row.times_used >= row.max_uses) return { ok: false, reason: 'exhausted' }
  if (row.tier && row.tier !== requestedTier) return { ok: false, reason: 'tier_mismatch' }
  return { ok: true, tier: row.tier }
}

export function promoCodeErrorMessage(check: Extract<PromoCodeCheck, { ok: false }>, requestedTierLabel: string): string {
  switch (check.reason) {
    case 'not_found':     return 'Invalid promo code'
    case 'revoked':       return 'This promo code is no longer active'
    case 'expired':       return 'This promo code has expired'
    case 'exhausted':     return 'This promo code has already been used up'
    case 'tier_mismatch': return `This code isn't valid for the ${requestedTierLabel} tier`
  }
}

/** Normalises user/admin input the same way everywhere: trimmed, upper-cased. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase()
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I - they're easy to misread/mistype

export function generateCodeString(length = 8): string {
  let out = ''
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return out
}
