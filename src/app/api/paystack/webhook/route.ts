import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import crypto from 'crypto'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!

// ============================================================
// This was previously a byte-for-byte duplicate of
// paystack/initiate/route.ts — i.e. not a webhook handler at all.
// It required a logged-in user session (which Paystack, calling
// server-to-server, will never have) and never verified the
// request actually came from Paystack.
//
// Paystack transfers are asynchronous: the /transfer call in
// initiate/route.ts only means "queued". This is the endpoint that
// finds out what actually happened, via transfer.success /
// transfer.failed / transfer.reversed events.
//
// Configure this exact URL in the Paystack dashboard under
// Settings → API Keys & Webhooks.
// ============================================================

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  // Verify the request genuinely came from Paystack before trusting
  // anything in it — Paystack signs the raw body with your secret key.
  const signature = request.headers.get('x-paystack-signature')
  const expectedSignature = crypto
    .createHmac('sha512', PAYSTACK_SECRET)
    .update(rawBody)
    .digest('hex')

  if (!signature || signature !== expectedSignature) {
    console.error('Paystack webhook: invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(rawBody)
  const admin = createAdminClient()

  try {
    switch (event.event) {
      case 'transfer.success': {
        const reference = event.data.reference
        const { data: txn } = await admin
          .from('transactions')
          .select('id, status')
          .eq('reference', reference)
          .single()

        if (!txn) {
          console.error(`Paystack webhook: no transaction found for reference ${reference}`)
          break
        }
        if (txn.status === 'completed') break // already processed, avoid double-handling

        await admin
          .from('transactions')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', txn.id)

        break
      }

      case 'transfer.failed':
      case 'transfer.reversed': {
        const reference = event.data.reference
        const { data: txn } = await admin
          .from('transactions')
          .select('id, status, wallet_id, amount_kobo')
          .eq('reference', reference)
          .single()

        if (!txn) {
          console.error(`Paystack webhook: no transaction found for reference ${reference}`)
          break
        }
        if (txn.status === 'failed') break // already processed

        const { data: wallet } = await admin
          .from('wallets')
          .select('balance_kobo')
          .eq('id', txn.wallet_id)
          .single()

        if (wallet) {
          // Restore the balance that was deducted optimistically at initiate time.
          await admin
            .from('wallets')
            .update({
              balance_kobo: wallet.balance_kobo + txn.amount_kobo,
              // A transfer that failed on Paystack's end isn't the user's
              // fault — don't make them wait out the 14-day cycle for a
              // withdrawal that never actually happened.
              last_payout_at: null,
            })
            .eq('id', txn.wallet_id)
        }

        await admin
          .from('transactions')
          .update({ status: 'failed' })
          .eq('id', txn.id)

        break
      }

      default:
        // Other events (e.g. transfer.reversed variants, dedicated account
        // events) can be added here as needed — ignore anything unhandled.
        break
    }

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error('Paystack webhook processing error:', error)
    // Still return 200 so Paystack doesn't retry-storm on a transient error
    // after we've already read/verified the event; log for manual follow-up.
    return NextResponse.json({ received: true, warning: 'processed with errors' })
  }
}
