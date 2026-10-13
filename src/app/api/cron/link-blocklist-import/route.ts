import { NextRequest, NextResponse } from 'next/server'
import { importThreatFeeds } from '@/lib/link-safety/feeds'

// Daily import of the OpenPhish + URLhaus feeds into the local link blocklist.
// Wire it up like the other crons (Vercel Cron / external scheduler), once a day:
//   { "path": "/api/cron/link-blocklist-import", "schedule": "17 3 * * *" }
// Requires CRON_SECRET in env (sent as `Authorization: Bearer ...`). Safe to run any time.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ feeds: await importThreatFeeds() })
  } catch (e) {
    console.error('link-blocklist-import failed:', e)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
