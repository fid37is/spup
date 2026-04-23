// src/app/api/ads/click/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const { ad_id, impression_id } = await request.json()
    if (!ad_id) return NextResponse.json({ error: 'ad_id required' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
    const ipHash = crypto
      .createHash('sha256')
      .update(ip + process.env.IP_HASH_SALT!)
      .digest('hex')
      .slice(0, 16)

    const admin = createAdminClient()

    // Fraud guard — one click per impression
    if (impression_id) {
      const { count } = await admin
        .from('ad_clicks')
        .select('id', { count: 'exact', head: true })
        .eq('impression_id', impression_id)

      if ((count || 0) > 0) {
        return NextResponse.json({ ok: true })  // silently ignore duplicate
      }
    }

    const userId = user
      ? (await supabase.from('users').select('id').eq('auth_id', user.id).single()).data?.id
      : null

    await admin.from('ad_clicks').insert({
      ad_id,
      impression_id: impression_id || null,
      user_id: userId || null,
      ip_hash: ipHash,
    })

    // Increment click counter on ad
    await admin.rpc('increment_counter', {
      p_table: 'ads',
      p_column: 'clicks',
      p_id: ad_id,
      p_amount: 1,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Click record error:', err)
    return NextResponse.json({ ok: true })  // never surface errors to client
  }
}