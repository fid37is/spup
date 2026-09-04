import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!
const PAYSTACK_BASE = 'https://api.paystack.co'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

const TIERS = {
  boost:     { price_kobo: 50_000,  duration_hours: 24,  label: 'Boost (1 day)' },
  spotlight: { price_kobo: 200_000, duration_hours: 72,  label: 'Spotlight (3 days)' },
  feature:   { price_kobo: 500_000, duration_hours: 168, label: 'Feature (7 days)' },
} as const

type Tier = keyof typeof TIERS

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

    const { post_id, tier } = await request.json() as { post_id?: string; tier?: Tier }

    if (!post_id || !tier || !(tier in TIERS)) {
      return NextResponse.json({ error: 'post_id and a valid tier are required' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('id')
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