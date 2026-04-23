// src/app/api/paystack/resolve-account/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  // Auth guard — only logged-in users can resolve accounts
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const account_number = searchParams.get('account_number')
  const bank_code = searchParams.get('bank_code')

  if (!account_number || !bank_code) {
    return NextResponse.json({ error: 'account_number and bank_code required' }, { status: 400 })
  }

  if (!/^\d{10}$/.test(account_number)) {
    return NextResponse.json({ error: 'Invalid account number' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
        // Cache resolve results for 5 minutes
        next: { revalidate: 300 },
      }
    )

    const data = await res.json()

    if (!res.ok || !data.status) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    return NextResponse.json({
      account_name: data.data.account_name,
      account_number: data.data.account_number,
    })
  } catch {
    return NextResponse.json({ error: 'Verification service unavailable' }, { status: 503 })
  }
}