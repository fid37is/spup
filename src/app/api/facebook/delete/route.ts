// app/api/facebook/delete/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const body = await request.text()
    
    // Parse the signed_request from Facebook
    const params = new URLSearchParams(body)
    const signedRequest = params.get('signed_request')
    
    if (!signedRequest) {
      return NextResponse.json({ error: 'No signed_request' }, { status: 400 })
    }

    // Decode the payload (second part after the dot)
    const [, payload] = signedRequest.split('.')
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64').toString('utf-8')
    )

    const userId = decoded.user_id

    // Delete the user from Supabase using service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Delete from your users table
    await supabase.from('users').delete().eq('facebook_id', userId)

    // Also delete from Supabase auth
    // You'd need to look up the auth user by their Facebook identity
    
    // Facebook requires you return a confirmation URL
    const confirmationCode = `delete_${userId}_${Date.now()}`
    
    return NextResponse.json({
      url: `https://spup.live/deletion-status?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    })
  } catch (err) {
    console.error('Facebook deletion callback error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}