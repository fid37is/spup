import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!
const PAYSTACK_BASE = 'https://api.paystack.co'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get('reference')
  if (!reference) return NextResponse.redirect(`${BASE_URL}/feed?promoted=failed`)

  const admin = createAdminClient()

  try {
    const { data: promotion } = await admin
      .from('post_promotions')
      .select('*')
      .eq('reference', reference)
      .single()

    if (!promotion) return NextResponse.redirect(`${BASE_URL}/feed?promoted=failed`)

    // Already processed (avoid double-activation if the user refreshes the callback)
    if (promotion.status === 'active' || promotion.status === 'completed') {
      return NextResponse.redirect(`${BASE_URL}/post/${promotion.post_id}?promoted=success`)
    }

    const verifyRes = await fetch(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    }).then(r => r.json())

    if (!verifyRes.status || verifyRes.data?.status !== 'success') {
      await admin.from('post_promotions').update({ status: 'failed' }).eq('reference', reference)
      return NextResponse.redirect(`${BASE_URL}/post/${promotion.post_id}?promoted=failed`)
    }

        const now = new Date()
    const endsAt = new Date(now.getTime() + promotion.duration_hours * 60 * 60 * 1000)

    await admin
      .from('post_promotions')
      .update({ status: 'active', starts_at: now.toISOString(), ends_at: endsAt.toISOString() })
      .eq('reference', reference)

    // Log to the finance ledger (no wallet balance change - this is external card spend)
    const { data: wallet } = await admin
      .from('wallets')
      .select('id')
      .eq('user_id', promotion.user_id)
      .single()

    if (wallet) {
      await admin.from('transactions').insert({
        wallet_id: wallet.id,
        type: 'promotion_spend',
        amount_kobo: promotion.price_kobo,
        status: 'completed',
        reference: `${reference}-TXN`,
        description: `Post promotion (${promotion.tier})`,
        entity_id: promotion.post_id,
        completed_at: now.toISOString(),
      })
    }

    return NextResponse.redirect(`${BASE_URL}/post/${promotion.post_id}?promoted=success`)

    

  } catch (error) {
    console.error('Promotion verify error:', error)
    return NextResponse.redirect(`${BASE_URL}/feed?promoted=failed`)
  }
}