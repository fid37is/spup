import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getCachedPreview, refreshPreview } from '@/lib/link-preview'
import { toHref } from '@/lib/urls'
import { parseShortLink } from '@/lib/link-safety/short-link'
import { getLinkBySlug } from '@/lib/link-safety/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/link-preview?url=https://...
 * Returns { preview } with the link's Open Graph card, or { preview: null }.
 * Signed-in users only, and only cache MISSES are rate-limited (they are the
 * ones that make our server call out to someone else's site).
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('url') || ''
  const href = toHref(raw)
  if (!href) return NextResponse.json({ preview: null }, { status: 400 })

  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ preview: null }, { status: 401 })

  try {
    // A Spup short link stands for the page it points at: build the card from that page, and
    // never for a link that has been blocked.
    let target = href
    const slug = parseShortLink(href)
    if (slug) {
      const link = await getLinkBySlug(slug)
      if (!link || link.safety_status === 'blocked') return NextResponse.json({ preview: null })
      target = link.resolved_url
    }

    let preview = await getCachedPreview(target)
    if (preview === undefined) {
      if (!(await checkRateLimit(`linkpreview:${user.id}`, 40, 60))) {
        return NextResponse.json({ preview: null }, { status: 429 })
      }
      preview = await refreshPreview(target)
    }
    return NextResponse.json({ preview }, { headers: { 'Cache-Control': 'private, max-age=3600' } })
  } catch (err) {
    console.error('link-preview failed:', err)
    return NextResponse.json({ preview: null })
  }
}
