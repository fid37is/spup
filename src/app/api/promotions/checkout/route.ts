import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/actions/admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { TIERS, isTier, checkPromoCode, promoCodeErrorMessage, normalizeCode, type PromoCodeRow } from '@/lib/promotions'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!
const PAYSTACK_BASE = 'https://api.paystack.co'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

async function paystackRequest(path: string, method: string, body?: object) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as { post_id?: string; tier?: string; promo_code?: string }
    const { post_id, tier } = body
    const promoCodeInput = body.promo_code?.trim() || undefined   // '' / whitespace-only counts as "no code"

    if (!post_id || !tier || !isTier(tier)) {
      return NextResponse.json({ error: 'post_id and a valid tier are required' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('id, username')
      .eq('auth_id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    // Confirm the post belongs to this user
    const { data: post } = await supabase
      .from('posts')
      .select('id, user_id, deleted_at')
      .eq('id', post_id)
      .single()

    if (!post || post.deleted_at) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (post.user_id !== profile.id) {
      return NextResponse.json({ error: 'You can only promote your own posts' }, { status: 403 })
    }

    // Block a second promotion while one is already pending/active for this post
    const { data: existing } = await supabase
      .from('post_promotions')
      .select('id, status')
      .eq('post_id', post_id)
      .in('status', ['pending', 'active'])
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'This post already has an active or pending promotion' }, { status: 409 })
    }

    const config = TIERS[tier]

    // ── Redeeming a promo code instead of paying ────────────────────────────
    if (promoCodeInput) {
      // A code is worth real money, so guessing at it is rate-limited the same
      // way a chat PIN is: a handful of tries per hour is far more than anyone
      // fat-fingering their own code needs.
      if (!(await checkRateLimit(`promo-code-attempt:${profile.id}`, 10, 60 * 60))) {
        return NextResponse.json({ error: 'Too many promo code attempts. Please try again later.' }, { status: 429 })
      }

      const admin = createAdminClient()
      const code = normalizeCode(promoCodeInput)
      const { data: codeRow } = await admin
        .from('promo_codes')
        .select('id, code, tier, max_uses, times_used, status, expires_at')
        .eq('code', code)
        .maybeSingle()

      const check = checkPromoCode(codeRow as PromoCodeRow | null, tier)
      if (!check.ok) {
        // Name the tier the CODE itself requires (not the one that was
        // requested) - "this only works for Feature" is what tells someone
        // what to actually do next; "this doesn't work for Boost" doesn't.
        const codeTier = (codeRow as PromoCodeRow | null)?.tier
        const codeTierLabel = codeTier && isTier(codeTier) ? TIERS[codeTier].label : config.label
        return NextResponse.json({ error: promoCodeErrorMessage(check, codeTierLabel) }, { status: 400 })
      }

      const grantedTier = (check.tier ?? tier) as typeof tier
      const grantedConfig = TIERS[grantedTier]
      const now = new Date()
      const endsAt = new Date(now.getTime() + grantedConfig.duration_hours * 60 * 60 * 1000)
      const reference = `SPUP-PROMO-CODE-${profile.id.slice(0, 8).toUpperCase()}-${Date.now()}`

      const { data: promotion, error: insertError } = await admin
        .from('post_promotions')
        .insert({
          post_id,
          user_id: profile.id,
          tier: grantedTier,
          price_kobo: grantedConfig.price_kobo,
          duration_hours: grantedConfig.duration_hours,
          status: 'active',
          reference,
          starts_at: now.toISOString(),
          ends_at: endsAt.toISOString(),
        })
        .select('id')
        .single()

      if (insertError || !promotion) {
        console.error(`Promo-code promotion insert failed (post_id=${post_id}, user_id=${profile.id}, tier=${grantedTier}):`, insertError?.message)
        return NextResponse.json({ error: 'Could not start promotion' }, { status: 500 })
      }

      // Consume the code: bump its counter and log the redemption. Not
      // atomic with the insert above (no cross-table transaction from here),
      // but codeRow.times_used was just re-checked against max_uses, and the
      // realistic worst case - two redemptions of the LAST use racing each
      // other - grants one extra free promotion, never a financial loss.
      await admin.from('promo_codes').update({ times_used: (codeRow as PromoCodeRow).times_used + 1 }).eq('id', (codeRow as PromoCodeRow).id)
      await admin.from('promo_code_redemptions').insert({
        promo_code_id: (codeRow as PromoCodeRow).id, user_id: profile.id, post_id, promotion_id: promotion.id,
      })
      await auditLog(profile.id, 'promo_code_redeemed', 'post', post_id, { code, tier: grantedTier })

      return NextResponse.json({ activated: true, reference, tier: grantedTier })
    }

    // ── Normal paid flow (unchanged) ────────────────────────────────────────
    const reference = `SPUP-PROMO-${profile.id.slice(0, 8).toUpperCase()}-${Date.now()}`

    const { error: insertError } = await supabase
      .from('post_promotions')
      .insert({
        post_id,
        user_id: profile.id,
        tier,
        price_kobo: config.price_kobo,
        duration_hours: config.duration_hours,
        status: 'pending',
        reference,
      })

    if (insertError) {
      console.error(`Promotion insert failed (post_id=${post_id}, user_id=${profile.id}, tier=${tier}):`, insertError.message, insertError.details, insertError.hint)
      return NextResponse.json({ error: 'Could not start promotion' }, { status: 500 })
    }

    const initRes = await paystackRequest('/transaction/initialize', 'POST', {
      email: user.email,
      amount: config.price_kobo,
      reference,
      callback_url: `${BASE_URL}/api/promotions/verify?reference=${reference}`,
      metadata: { post_id, tier, purpose: 'post_promotion' },
    })

    if (!initRes.status) {
      console.error(`Paystack initialize failed (reference=${reference}):`, initRes.message, initRes)
      await supabase.from('post_promotions').update({ status: 'failed' }).eq('reference', reference)
      return NextResponse.json({ error: 'Could not initialize payment' }, { status: 502 })
    }

    return NextResponse.json({
      authorization_url: initRes.data.authorization_url,
      reference,
    })

  } catch (error) {
    console.error('Promotion checkout error:', error)
    return NextResponse.json({ error: 'Checkout failed. Please try again.' }, { status: 500 })
  }
}
