import { NextResponse } from 'next/server'
import { createClient, getAuthUser } from '@/lib/supabase/server'

/**
 * The announcements that are live right now, for the banner provider
 * (components/layout/announcement-provider.tsx) to poll. The provider needs this
 * because "show it again after 6 hours" has to work for someone who never reloads
 * the page, and because a maintenance notice published mid-session should appear
 * without a refresh.
 *
 * Uses the signed-in user's own client, so RLS (announcements_read_live) is what
 * decides which rows are live. Dismissals are not applied here - they live in the
 * person's cookie and are applied in the browser.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ rows: [] }, { status: 401, headers: { 'Cache-Control': 'no-store' } })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('announcements')
    .select('id, kind, title, body, cta_label, cta_url, ends_at, remind_after_hours')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    // Includes "table doesn't exist yet". Say nothing is live rather than failing loudly.
    return NextResponse.json({ rows: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json({ rows: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}
