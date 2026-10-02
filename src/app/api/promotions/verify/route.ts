import { NextRequest } from 'next/server'
import { paymentRedirect } from '@/lib/payment-redirect'
import { createAdminClient } from '@/lib/supabase/server'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!
const PAYSTACK_BASE = 'https://api.paystack.co'

export async function GET(request: NextRequest) {
  const isApp = request.nextUrl.searchParams.get('app') === '1'
  const reference = request.nextUrl.searchParams.get('reference')
  if (!reference) return paymentRedirect(`/feed?promoted=failed`, isApp)

  const admin = createAdminClient()

  try {
    const { data: promotion } = await admin
      .from('post_promotions')
      .select('*')
      .eq('reference', reference)
      .single()

    if (!promotion) return paymentRedirect(`/feed?promoted=failed`, isApp)

    // Already processed (avoid double-activation if the user refreshes the callback)
    if (promotion.status === 'active' || promotion.status === 'completed') {
      return paymentRedirect(`/post/${promotion.post_id}?promoted=success`, isApp)
    }

    const verifyRes = await fetch(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    }).then(r => r.json())

    if (!verifyRes.status || verifyRes.data?.status !== 'success') {
      await admin.from('post_promotions').update({ status: 'failed' }).eq('reference', reference)
      return paymentRedirect(`/post/${promotion.post_id}?promoted=failed`, isApp)
    }

    // Revenue is what Paystack actually collected (kobo), not the tier's list price.
    const amountPaidKobo = Number(verifyRes.data?.amount) || promotion.price_kobo

    const now = new Date()
    const endsAt = new Date(now.getTime() + promotion.duration_hours * 60 * 60 * 1000)

    await admin
      .from('post_promotions')
      .update({ status: 'active', starts_at: now.toISOString(), ends_at: endsAt.toISOString(), amount_paid_kobo: amountPaidKobo })
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
        amount_kobo: amountPaidKobo,
        status: 'completed',
        reference: `${reference}-TXN`,
        description: `Post promotion (${promotion.tier})`,
        entity_id: promotion.post_id,
        completed_at: now.toISOString(),
      })
    }

    return paymentRedirect(`/post/${promotion.post_id}?promoted=success`, isApp)

    

  } catch (error) {
    console.error('Promotion verify error:', error)
    return paymentRedirect(`/feed?promoted=failed`, isApp)
  }
}