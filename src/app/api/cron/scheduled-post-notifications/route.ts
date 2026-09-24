import { NextRequest, NextResponse } from 'next/server'
import { processDueScheduledPosts } from '@/lib/post-notifications'

// ============================================================
// Sends @mention + "new post" notifications for scheduled posts
// once they go live. Wire it up exactly like escrow-auto-release
// (Vercel Cron in vercel.json, or Supabase pg_cron / any external
// scheduler), every minute or two:
//
//   { "path": "/api/cron/scheduled-post-notifications", "schedule": "* * * * *" }
//
// Requires CRON_SECRET in env (sent as `Authorization: Bearer ...`).
// Safe to run as often as you like - each post is claimed once.
// ============================================================

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await processDueScheduledPosts()
    return NextResponse.json(result)
  } catch (e) {
    console.error('scheduled-post-notifications failed:', e)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
