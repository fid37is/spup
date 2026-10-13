import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { SLUG_RE } from '@/lib/link-safety/short-link'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/links/meta?slugs=xK3p9Aq,Qw81zLm
 * What the text renderer needs to draw a short link: the destination's domain (for the
 * "example.com ↗" badge) and its current status (so a link blocked after it was posted
 * stops looking clickable). Public - it is only a domain and a status - and only ever looks
 * up stored slugs; it never accepts a destination address.
 */
export async function GET(request: NextRequest) {
  const slugs = [...new Set((request.nextUrl.searchParams.get('slugs') ?? '').split(',').map(s => s.trim()).filter(s => SLUG_RE.test(s)))].slice(0, 25)
  if (slugs.length === 0) return NextResponse.json({ links: {} })

  const ip = (request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  if (!(await checkRateLimit(`linkmeta:${ip}`, 180, 60))) {
    return NextResponse.json({ links: {} }, { status: 429 })
  }

  try {
    const { data, error } = await createAdminClient()
      .from('links')
      .select('slug, domain, safety_status, normalized_url')
      .in('slug', slugs)
    if (error) throw error
    const links: Record<string, { domain: string; status: 'safe' | 'unknown' | 'blocked'; url: string }> = {}
    for (const row of data ?? []) links[row.slug] = { domain: row.domain, status: row.safety_status, url: row.normalized_url }
    return NextResponse.json({ links }, { headers: { 'Cache-Control': 'public, max-age=30' } })
  } catch (err) {
    console.error('links/meta failed:', err)
    return NextResponse.json({ links: {} })
  }
}
