import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { BIG_TRANSACTION_THRESHOLD_KOBO } from '@/lib/constants'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!
const PAYSTACK_BASE = 'https://api.paystack.co'
const PAYOUT_CYCLE_DAYS = 14

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
      .select('id, nin_verified, bvn_verified')
      .eq('auth_id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    if (!profile.nin_verified) {
      return NextResponse.json({ error: 'NIN verification required before withdrawal' }, { status: 403 })
    }

    // 5 attempts per hour per user — independent of the 14-day payout-cycle
    // rule below, which only kicks in after a successful withdrawal and
    // does nothing to stop repeated hits on this endpoint otherwise.
    const withinLimit = await checkRateLimit(`withdraw:${profile.id}`, 5, 3600)
    if (!withinLimit) {
      return NextResponse.json({ error: 'Too many withdrawal attempts. Please try again later.' }, { status: 429 })
    }

    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', profile.id)
      .single()

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

    // Payout cycle: withdrawals only every 14 days, not on demand — gives the
    // earnings pipeline time to catch and reverse fraud-flagged amounts
    // before money actually leaves the platform.
    if (wallet.last_payout_at) {
      const nextEligible = new Date(wallet.last_payout_at)
      nextEligible.setDate(nextEligible.getDate() + PAYOUT_CYCLE_DAYS)

      if (nextEligible > new Date()) {
        return NextResponse.json({
          error: `You can request your next withdrawal on ${nextEligible.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}.`,
          next_eligible_at: nextEligible.toISOString(),
        }, { status: 429 })
      }
    }

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

    // BVN is a second, additional check — only required once a withdrawal
    // is genuinely large. Below the threshold, NIN alone (checked above)
    // is enough. This keeps BVN out of the way for everyday use.
    if (amount_kobo >= BIG_TRANSACTION_THRESHOLD_KOBO && !profile.bvn_verified) {
      return NextResponse.json({
        error: `BVN verification is required for withdrawals of ₦${(BIG_TRANSACTION_THRESHOLD_KOBO / 100).toLocaleString()} or more.`,
      }, { status: 403 })
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

    // Step 4: Deduct from balance immediately (prevent double-spend). Uses
    // adjust_wallet_balance (atomic SQL UPDATE) rather than writing back
    // wallet.balance_kobo - amount_kobo, which would race against any other
    // concurrent change to this wallet and could double-spend under two
    // near-simultaneous withdrawal requests. That RPC is only executable by
    // service_role (see migration 014), so this specifically needs the
    // admin client — the rest of this route stays on the user-scoped
    // `supabase` client for reads and identity checks.
    const admin = createAdminClient()
    const { error: debitError } = await admin.rpc('adjust_wallet_balance', {
      p_wallet_id: wallet.id,
      p_delta: -amount_kobo,
    })
    if (debitError) {
      await supabase.from('transactions').update({ status: 'failed' }).eq('id', txn.id)
      return NextResponse.json({ error: 'Could not process withdrawal — balance may have changed. Please try again.' }, { status: 409 })
    }

    // Step 5: Initiate Paystack transfer
    const transferRes = await paystackRequest('/transfer', 'POST', {
      source: 'balance',
      amount: amount_kobo,   // Paystack also uses kobo
      recipient: recipientCode,
      reason: 'Spup creator earnings withdrawal',
      reference,
    })

    if (!transferRes.status) {
      // Rollback: restore balance and mark transaction failed. Credits back
      // the exact amount rather than resetting to the wallet.balance_kobo
      // snapshot taken at the top of this request, which could otherwise
      // overwrite an unrelated change that happened during the Paystack
      // round-trip.
      await Promise.all([
        admin.rpc('adjust_wallet_balance', { p_wallet_id: wallet.id, p_delta: amount_kobo }),
        supabase.from('transactions').update({ status: 'failed' }).eq('id', txn.id),
      ])
      return NextResponse.json({ error: 'Transfer failed. Your balance has been restored.' }, { status: 502 })
    }

    // Step 6: Record this payout so the next 14-day window starts now
    await supabase
      .from('wallets')
      .update({ last_payout_at: new Date().toISOString() })
      .eq('id', wallet.id)

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
