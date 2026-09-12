// src/app/api/wallet/resolve-recipient/route.ts
//
// Thin GET wrapper around resolveTransferRecipientAction, mirroring
// /api/paystack/resolve-account's debounced-fetch pattern (see
// withdraw-button.tsx) so send-button.tsx can reuse the same
// useEffect+fetch idiom instead of a server action bound to a form.
import { NextRequest, NextResponse } from 'next/server'
import { resolveTransferRecipientAction } from '@/lib/actions/wallet-transfer'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const username = searchParams.get('username')

  if (!username) {
    return NextResponse.json({ error: 'username is required' }, { status: 400 })
  }

  const result = await resolveTransferRecipientAction(username)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 404 })
  }

  return NextResponse.json({ recipient: result.recipient })
}