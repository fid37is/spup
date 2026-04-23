import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!

function verifyPaystackSignature(body: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha512', PAYSTACK_SECRET)
    .update(body)
    .digest('hex')
  return hash === signature
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-paystack-signature') || ''

  // CRITICAL: Always verify webhook signature
  if (!verifyPaystackSignature(rawBody, signature)) {
    console.error('Invalid Paystack webhook signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(rawBody)
  const supabase = createAdminClient()  // Admin client for webhook processing

  try {
    switch (event.event) {

      // ─── Transfer completed (withdrawal succeeded) ─────────────────────
      case 'transfer.success': {
        const { reference, amount } = event.data
        await supabase
          .from('transactions')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            metadata: event.data,
          })
          .eq('reference', reference)

        // Update wallet total_withdrawn
        const { data: txn } = await supabase
          .from('transactions')
          .select('wallet_id')
          .eq('reference', reference)
          .single()

        if (txn) {
          const { data: wallet } = await supabase
            .from('wallets')
            .select('total_withdrawn_kobo')
            .eq('id', txn.wallet_id)
            .single()

          if (wallet) {
            await supabase
              .from('wallets')
              .update({ total_withdrawn_kobo: wallet.total_withdrawn_kobo + amount })
              .eq('id', txn.wallet_id)
          }
        }
        break
      }

      // ─── Transfer failed (restore balance) ────────────────────────────
      case 'transfer.failed':
      case 'transfer.reversed': {
        const { reference, amount } = event.data

        const { data: txn } = await supabase
          .from('transactions')
          .select('wallet_id, status')
          .eq('reference', reference)
          .single()

        if (txn && txn.status === 'pending') {
          // Restore balance
          const { data: wallet } = await supabase
            .from('wallets')
            .select('balance_kobo')
            .eq('id', txn.wallet_id)
            .single()

          if (wallet) {
            await supabase
              .from('wallets')
              .update({ balance_kobo: wallet.balance_kobo + amount })
              .eq('id', txn.wallet_id)
          }

          await supabase
            .from('transactions')
            .update({ status: event.event === 'transfer.reversed' ? 'reversed' : 'failed' })
            .eq('reference', reference)

          // Notify user
          const walletRow = await supabase
            .from('wallets')
            .select('user_id')
            .eq('id', txn.wallet_id)
            .single()

          if (walletRow.data) {
            await supabase.from('notifications').insert({
              recipient_id: walletRow.data.user_id,
              actor_id: null,
              type: 'system',
              entity_type: 'transaction',
              entity_id: txn.wallet_id,
              metadata: {
                message: 'Your withdrawal could not be processed. Your balance has been restored.',
                reference,
              },
            })
          }
        }
        break
      }

      // ─── Charge success (tips / subscriptions) ───────────────────────
      case 'charge.success': {
        const { reference, amount, metadata } = event.data
        const { recipient_user_id, payer_user_id, type } = metadata || {}

        if (!recipient_user_id) break

        const { data: wallet } = await supabase
          .from('wallets')
          .select('id, balance_kobo, total_earned_kobo')
          .eq('user_id', recipient_user_id)
          .single()

        if (!wallet) break

        // Platform fee: 10% on tips/subscriptions
        const platformFee = Math.round(amount * 0.1)
        const creatorAmount = amount - platformFee

        await supabase.from('wallets').update({
          balance_kobo: wallet.balance_kobo + creatorAmount,
          total_earned_kobo: wallet.total_earned_kobo + creatorAmount,
        }).eq('id', wallet.id)

        await supabase.from('transactions').insert({
          wallet_id: wallet.id,
          type: type === 'tip' ? 'earning_tip' : 'earning_subscription',
          amount_kobo: creatorAmount,
          platform_fee_kobo: platformFee,
          status: 'completed',
          reference,
          completed_at: new Date().toISOString(),
          metadata: event.data,
        })

        // Notify recipient
        await supabase.from('notifications').insert({
          recipient_id: recipient_user_id,
          actor_id: payer_user_id || null,
          type: 'tip_received',
          entity_type: 'transaction',
          metadata: { amount_kobo: creatorAmount },
        })
        break
      }

      default:
        // Log unhandled events for debugging
        console.log(`Unhandled Paystack event: ${event.event}`)
    }

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error('Webhook processing error:', error)
    // Return 200 to prevent Paystack retries for non-retriable errors
    return NextResponse.json({ received: true, warning: 'Processing error logged' })
  }
}

// Paystack sends POST only
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
