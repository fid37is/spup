import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!
const PAYSTACK_BASE = 'https://api.paystack.co'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

const MIN_TOPUP_KOBO = 50_000   // ₦500
const MAX_TOPUP_KOBO = 50_000_000 // ₦500,000 — sanity ceiling, raise if needed

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

    const { amount_kobo } = await request.json() as { amount_kobo?: number }

    if (!amount_kobo || !Number.isInteger(amount_kobo)) {
      return NextResponse.json({ error: 'amount_kobo is required' }, { status: 400 })
    }
    if (amount_kobo < MIN_TOPUP_KOBO) {
      return NextResponse.json({ error: `Minimum top-up is ₦${(MIN_TOPUP_KOBO / 100).toFixed(0)}` }, { status: 400 })
    }
    if (amount_kobo > MAX_TOPUP_KOBO) {
      return NextResponse.json({ error: `Maximum top-up is ₦${(MAX_TOPUP_KOBO / 100).toFixed(0)}` }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('id, status')
      .eq('auth_id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    if (profile.status === 'banned' || profile.status === 'suspended') {
      return NextResponse.json({ error: 'Account not eligible for wallet top-up' }, { status: 403 })
    }

    const { data: wallet } = await supabase
      .from('wallets')
      .select('id')
      .eq('user_id', profile.id)
      .single()

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

    const reference = `SPUP-TOPUP-${profile.id.slice(0, 8).toUpperCase()}-${Date.now()}`

    // Log a pending transaction up front, same pattern as post_promotions —
    // the verify step below flips it to completed and credits the wallet.
    const { error: insertError } = await supabase.from('transactions').insert({
      wallet_id: wallet.id,
      type: 'wallet_topup',
      amount_kobo,
      status: 'pending',
      reference,
      description: 'Wallet top-up',
    })

    if (insertError) {
      return NextResponse.json({ error: 'Could not start top-up' }, { status: 500 })
    }

    const initRes = await paystackRequest('/transaction/initialize', 'POST', {
      email: user.email,
      amount: amount_kobo,
      reference,
      callback_url: `${BASE_URL}/api/wallet/topup/verify?reference=${reference}`,
      metadata: { user_id: profile.id, purpose: 'wallet_topup' },
    })

    if (!initRes.status) {
      await supabase.from('transactions').update({ status: 'failed' }).eq('reference', reference)
      return NextResponse.json({ error: 'Could not initialize payment' }, { status: 502 })
    }

    return NextResponse.json({
      authorization_url: initRes.data.authorization_url,
      reference,
    })

  } catch (error) {
    console.error('Wallet top-up checkout error:', error)
    return NextResponse.json({ error: 'Checkout failed. Please try again.' }, { status: 500 })
  }
}