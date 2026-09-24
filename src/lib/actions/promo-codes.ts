'use server'

// src/lib/actions/promo-codes.ts
//
// Admin-only management of promo codes (generate/revoke). Redeeming a code
// happens in app/api/promotions/checkout/route.ts, not here - that's the
// person promoting their own post, not an admin action.

import { revalidatePath } from 'next/cache'
import { requireAdmin, auditLog } from '@/lib/actions/admin'
import { TIERS, isTier, generateCodeString } from '@/lib/promotions'

export interface GeneratePromoCodeInput {
  tier: 'any' | keyof typeof TIERS
  label?: string
  maxUses?: number
  expiresInDays?: number
}

// This grants free value, so it's admin-only, not moderator - unlike most of
// the actions in lib/actions/admin.ts which pass allowModerator's default (true).
export async function generatePromoCodeAction(input: GeneratePromoCodeInput) {
  const { error, admin, profile } = await requireAdmin(false)
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  if (input.tier !== 'any' && !isTier(input.tier)) return { error: 'Invalid tier' }
  const tier = input.tier === 'any' ? null : input.tier
  const maxUses = Math.min(1000, Math.max(1, Math.floor(input.maxUses ?? 1)))
  const expiresAt = input.expiresInDays && input.expiresInDays > 0
    ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString()
    : null
  const label = input.label?.trim().slice(0, 200) || null

  // The code space (32^8 ≈ 1.1 trillion) makes a collision astronomically
  // unlikely; retrying a few times on the off chance is cheaper than a
  // pre-check-then-insert race.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCodeString()
    const { data, error: insertError } = await admin
      .from('promo_codes')
      .insert({ code, tier, label, max_uses: maxUses, expires_at: expiresAt, created_by: profile.id })
      .select('id, code')
      .single()

    if (!insertError && data) {
      await auditLog(profile.id, 'generate_promo_code', 'promo_code', data.id, { code: data.code, tier: input.tier, maxUses, label })
      revalidatePath('/promo-codes')
      return { success: true as const, code: data.code as string }
    }
    if (insertError?.code !== '23505') {   // not a uniqueness conflict - retrying won't help
      console.error('[generatePromoCodeAction] insert failed:', insertError?.message)
      return { error: 'Could not create code' }
    }
  }
  return { error: 'Could not generate a unique code - please try again' }
}

export async function revokePromoCodeAction(id: string) {
  const { error, admin, profile } = await requireAdmin(false)
  if (error || !admin || !profile) return { error: error || 'Forbidden' }

  const { error: updateError } = await admin.from('promo_codes').update({ status: 'revoked', updated_at: new Date().toISOString() }).eq('id', id)
  if (updateError) return { error: 'Could not revoke code' }

  await auditLog(profile.id, 'revoke_promo_code', 'promo_code', id, {})
  revalidatePath('/promo-codes')
  return { success: true }
}
