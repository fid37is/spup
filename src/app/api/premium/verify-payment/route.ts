import { NextRequest } from 'next/server'
import { paymentRedirect } from '@/lib/payment-redirect'
import { creditPremiumPayment } from '@/lib/premium'

// Paystack sends the user back here after paying. We confirm with Paystack,
// activate Premium and drop them on /premium. (The charge.success webhook
// does the same in case they never get here.)
export async function GET(request: NextRequest) {
  const isApp = request.nextUrl.searchParams.get('app') === '1'
  const reference = request.nextUrl.searchParams.get('reference')
  if (!reference) return paymentRedirect('/wallet', isApp)

  try {
    const { ok } = await creditPremiumPayment(reference)
    return paymentRedirect(`/wallet?premium=${ok ? '1' : 'failed'}`, isApp)
  } catch (error) {
    console.error('Premium payment verify error:', error)
    return paymentRedirect('/wallet?premium=failed', isApp)
  }
}