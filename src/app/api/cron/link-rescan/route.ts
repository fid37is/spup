import { NextRequest, NextResponse } from 'next/server'
import { rescanLinks } from '@/lib/link-safety/rescan'

// Re-checks stored links that have not been checked for 24 hours (oldest first, 40 per run), so a
// link that turns malicious later is blocked everywhere it was shared. Run it every 15-30 minutes:
//   { "path": "/api/cron/link-rescan", "schedule": "*/20 * * * *" }
// Requires CRON_SECRET in env (sent as `Authorization: Bearer ...`).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await rescanLinks())
  } catch (e) {
    console.error('link-rescan failed:', e)
    return NextResponse.json({ error: 'Rescan failed' }, { status: 500 })
  }
}
