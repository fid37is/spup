import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!
const PAYSTACK_BASE = 'https://api.paystack.co'

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

    const { data: profile } = await supabase
      .from('users')
      .select('id, bvn_verified')
      .eq('auth_id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    if (!profile.bvn_verified) {
      return NextResponse.json({ error: 'BVN verification required before withdrawal' }, { status: 403 })
    }

    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', profile.id)
      .single()

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

    // Minimum withdrawal: ₦1,000 = 100,000 kobo
    if (wallet.balance_kobo < 100_000) {
      return NextResponse.json({
        error: `Minimum withdrawal is ₦1,000. Current balance: ₦${(wallet.balance_kobo / 100).toFixed(2)}`
      }, { status: 400 })
    }

    const body = await request.json()
    const { amount_kobo, bank_code, account_number } = body

    if (!amount_kobo || !bank_code || !account_number) {
      return NextResponse.json({ error: 'amount_kobo, bank_code, and account_number are required' }, { status: 400 })
    }

    if (amount_kobo > wallet.balance_kobo) {
      return NextResponse.json({ error: 'Withdrawal amount exceeds available balance' }, { status: 400 })
    }

    // Step 1: Create or reuse Paystack transfer recipient
    let recipientCode = wallet.paystack_recipient_code

    if (!recipientCode) {
      const recipientRes = await paystackRequest('/transferrecipient', 'POST', {
        type: 'nuban',
        name: body.account_name || 'Spup Creator',
        account_number,
        bank_code,
        currency: 'NGN',
      })

      if (!recipientRes.status) {
        return NextResponse.json({ error: 'Failed to create transfer recipient' }, { status: 502 })
      }

      recipientCode = recipientRes.data.recipient_code

      // Save for future withdrawals
      await supabase
        .from('wallets')
        .update({
          paystack_recipient_code: recipientCode,
          bank_name: recipientRes.data.details?.bank_name,
          bank_account_number: account_number,
          bank_account_name: body.account_name,
        })
        .eq('id', wallet.id)
    }

    // Step 2: Generate unique reference
    const reference = `SPUP-WD-${profile.id.slice(0, 8).toUpperCase()}-${Date.now()}`

    // Step 3: Create pending transaction record BEFORE transfer (idempotency)
    const { data: txn, error: txnError } = await supabase
      .from('transactions')
      .insert({
        wallet_id: wallet.id,
        type: 'withdrawal',
        amount_kobo,
        platform_fee_kobo: 0,
        status: 'pending',
        reference,
        description: `Withdrawal to ${account_number}`,
        metadata: { bank_code, account_number, recipient_code: recipientCode },
      })
      .select('id')
      .single()

    if (txnError) {
      return NextResponse.json({ error: 'Failed to create transaction record' }, { status: 500 })
    }

    // Step 4: Deduct from balance immediately (prevent double-spend)
    await supabase
      .from('wallets')
      .update({ balance_kobo: wallet.balance_kobo - amount_kobo })
      .eq('id', wallet.id)

    // Step 5: Initiate Paystack transfer
    const transferRes = await paystackRequest('/transfer', 'POST', {
      source: 'balance',
      amount: amount_kobo,   // Paystack also uses kobo
      recipient: recipientCode,
      reason: 'Spup creator earnings withdrawal',
      reference,
    })

    if (!transferRes.status) {
      // Rollback: restore balance and mark transaction failed
      await Promise.all([
        supabase.from('wallets').update({ balance_kobo: wallet.balance_kobo }).eq('id', wallet.id),
        supabase.from('transactions').update({ status: 'failed' }).eq('id', txn.id),
      ])
      return NextResponse.json({ error: 'Transfer failed. Your balance has been restored.' }, { status: 502 })
    }

    // Update transaction with Paystack transfer code
    await supabase
      .from('transactions')
      .update({ metadata: { ...transferRes.data, bank_code, account_number } })
      .eq('id', txn.id)

    return NextResponse.json({
      success: true,
      reference,
      transfer_code: transferRes.data.transfer_code,
      message: 'Withdrawal initiated. Funds arrive in 3–5 business days.',
    })

  } catch (error) {
    console.error('Withdrawal error:', error)
    return NextResponse.json({ error: 'Withdrawal failed. Please try again.' }, { status: 500 })
  }
}
