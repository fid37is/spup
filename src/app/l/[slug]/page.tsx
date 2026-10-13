// src/app/l/[slug]/page.tsx
//
// The "you're leaving Spup" page. Every short link (spup.live/l/xK3p9Aq) opens here.
//
// Security rules (see the link-safety spec, section 6):
//  - It only ever looks a slug up in the links table. There is no ?url= parameter and no way
//    to hand this route a destination, so it cannot be used as an open redirect.
//  - The destination comes from the database row; "Continue" is a plain link to it.
//  - Blocked links never reveal or open their destination.
//  - robots.txt disallows /l/ and the page is noindex, so crawlers never index redirect slugs.

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LanguageProvider } from '@/lib/i18n/language-context'
import { loadDictionary } from '@/lib/i18n/dictionaries'
import { getCookieLocale } from '@/lib/i18n/locale-cookie.server'
import { createAdminClient } from '@/lib/supabase/server'
import { getLinkBySlug } from '@/lib/link-safety/service'
import { checkLocalBlocklist } from '@/lib/link-safety/blocklist'
import { isTrustedDomain } from '@/lib/link-safety/engine'
import { SLUG_RE } from '@/lib/link-safety/short-link'
import { APPEAL_URL } from '@/lib/link-safety/config'
import LinkView from './link-view'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Leaving Spup',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
}

export default async function LinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const locale = await getCookieLocale()
  const dict = await loadDictionary(locale)

  const wrap = (view: React.ReactNode) => (
    <LanguageProvider initialLocale={locale} initialMessages={dict}>{view}</LanguageProvider>
  )

  const link = SLUG_RE.test(slug) ? await getLinkBySlug(slug) : null
  if (!link) return wrap(<LinkView state="missing" appealUrl={APPEAL_URL} />)

  let blocked = link.safety_status === 'blocked'

  // The stored verdict may be hours old; the local threat lists are cheap to ask again right now.
  if (!blocked) {
    let dest: URL | null = null
    try { dest = new URL(link.resolved_url) } catch { /* unusable address: treated as blocked below */ }
    if (!dest) {
      blocked = true
    } else {
      const hit = await checkLocalBlocklist([dest])
      if (hit) {
        blocked = true
        await createAdminClient().from('links').update({
          safety_status: 'blocked', block_reason: `blocklist:${hit.source}:${hit.kind}`, last_checked_at: new Date().toISOString(),
        }).eq('id', link.id)
      }
    }
  }
  if (blocked) return wrap(<LinkView state="blocked" appealUrl={APPEAL_URL} slug={link.slug} />)

  void createAdminClient().rpc('bump_link_click', { p_link: link.id }).then(() => undefined, () => undefined)

  // Trusted sites (YouTube...) skip the warning.
  if (isTrustedDomain(new URL(link.resolved_url).hostname)) redirect(link.resolved_url)

  return wrap(
    <LinkView
      state="warn"
      slug={link.slug}
      domain={link.domain}
      url={link.resolved_url}
      verified={link.safety_status === 'safe'}
      appealUrl={APPEAL_URL}
    />,
  )
}
