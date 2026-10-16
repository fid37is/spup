import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { suspensionBlock } from '@/lib/suspension-server'
import { getPremiumPriceKobo, PREMIUM_REFERENCE_PREFIX } from '@/lib/premium'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!
const PAYSTACK_BASE = 'https://api.paystack.co'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

// POST { app?: boolean } — start a Premium payment (subscribe or renew).
// The amount is decided here from platform_settings, never from the request.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { app } = await request.json().catch(() => ({})) as { app?: boolean }

    const { data: profile } = await supabase
      .from('users')
      .select('id, status')
      .eq('auth_id', user.id)
      .single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    if (profile.status === 'banned') return NextResponse.json({ error: 'Account not eligible' }, { status: 403 })
    const suspended = await suspensionBlock(profile)
    if (suspended) return NextResponse.json(suspended, { status: 403 })

    if (!(await checkRateLimit(`premium-checkout:${profile.id}`, 5, 3600))) {
      return NextResponse.json({ error: 'Too many payment attempts. Please try again later.' }, { status: 429 })
    }

    const admin = createAdminClient()
    const amountKobo = await getPremiumPriceKobo()
    const reference = `${PREMIUM_REFERENCE_PREFIX}${profile.id.slice(0, 8).toUpperCase()}-${Date.now()}`

    const { error: insertError } = await admin.from('premium_payments').insert({
      user_id: profile.id,
      amount_kobo: amountKobo,
      reference,
      status: 'pending',
    })
    if (insertError) {
      console.error('premium_payments insert failed:', insertError)
      return NextResponse.json({ error: 'Could not start payment' }, { status: 500 })
    }

    const initRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        amount: amountKobo,
        currency: 'NGN',
        reference,
        callback_url: `${BASE_URL}/api/premium/verify-payment?reference=${reference}${app === true ? '&app=1' : ''}`,
        metadata: { user_id: profile.id, purpose: 'premium_subscription' },
      }),
    }).then(r => r.json())

    if (!initRes.status) {
      await admin.from('premium_payments').update({ status: 'failed' }).eq('reference', reference)
      return NextResponse.json({ error: 'Could not initialize payment' }, { status: 502 })
    }

    return NextResponse.json({ authorization_url: initRes.data.authorization_url, reference })
  } catch (error) {
    console.error('Premium checkout error:', error)
    return NextResponse.json({ error: 'Checkout failed. Please try again.' }, { status: 500 })
  }
}
