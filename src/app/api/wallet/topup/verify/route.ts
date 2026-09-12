import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!
const PAYSTACK_BASE = 'https://api.paystack.co'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get('reference')
  if (!reference) return NextResponse.redirect(`${BASE_URL}/wallet?topup=failed`)

  const admin = createAdminClient()

  try {
    const { data: txn } = await admin
      .from('transactions')
      .select('id, wallet_id, amount_kobo, status')
      .eq('reference', reference)
      .single()

    if (!txn) return NextResponse.redirect(`${BASE_URL}/wallet?topup=failed`)

    // Already processed — avoid double-crediting if the user refreshes
    // the callback page or Paystack redirects twice.
    if (txn.status === 'completed') {
      return NextResponse.redirect(`${BASE_URL}/wallet?topup=success`)
    }

    const verifyRes = await fetch(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    }).then(r => r.json())

    if (!verifyRes.status || verifyRes.data?.status !== 'success') {
      await admin.from('transactions').update({ status: 'failed' }).eq('id', txn.id)
      return NextResponse.redirect(`${BASE_URL}/wallet?topup=failed`)
    }

    // Guard against a tampered/mismatched amount — trust what Paystack
    // actually confirms was charged, not the row we wrote optimistically.
    if (verifyRes.data.amount !== txn.amount_kobo) {
      console.error(`Wallet top-up amount mismatch for ${reference}: expected ${txn.amount_kobo}, got ${verifyRes.data.amount}`)
      await admin.from('transactions').update({ status: 'failed' }).eq('id', txn.id)
      return NextResponse.redirect(`${BASE_URL}/wallet?topup=failed`)
    }

    const { data: wallet } = await admin
      .from('wallets')
      .select('balance_kobo')
      .eq('id', txn.wallet_id)
      .single()

    if (!wallet) return NextResponse.redirect(`${BASE_URL}/wallet?topup=failed`)

    await admin
      .from('wallets')
      .update({ balance_kobo: wallet.balance_kobo + txn.amount_kobo })
      .eq('id', txn.wallet_id)

    await admin
      .from('transactions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', txn.id)

    return NextResponse.redirect(`${BASE_URL}/wallet?topup=success`)

  } catch (error) {
    console.error('Wallet top-up verify error:', error)
    return NextResponse.redirect(`${BASE_URL}/wallet?topup=failed`)
  }
}
