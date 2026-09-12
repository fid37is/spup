import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { releaseEscrow } from '@/lib/actions/escrow'

// ============================================================
// Protects sellers from buyers going silent to dodge payment.
// Wire this up to Vercel Cron (vercel.json) or a Supabase pg_cron
// job hitting this URL, e.g. every 15 minutes:
//
//   { "path": "/api/cron/escrow-auto-release", "schedule": "*/15 * * * *" }
//
// Requires CRON_SECRET in env — set the same value as the
// Authorization header Vercel Cron sends, or pass it yourself if
// triggering from pg_cron/an external scheduler.
// ============================================================

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: dueOrders, error } = await admin
    .from('escrow_orders')
    .select('id')
    .eq('status', 'delivered_by_seller')
    .lte('auto_release_at', now)

  if (error) {
    console.error('Escrow auto-release query error:', error)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  const results = { released: 0, failed: 0 }

  for (const order of dueOrders ?? []) {
    const result = await releaseEscrow(order.id, 'auto_release')
    if (result.error) {
      results.failed++
      console.error(`Auto-release failed for order ${order.id}: ${result.error}`)
    } else {
      results.released++
    }
  }

  return NextResponse.json({ processed: dueOrders?.length ?? 0, ...results })
}
