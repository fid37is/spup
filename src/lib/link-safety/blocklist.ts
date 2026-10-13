// src/lib/link-safety/blocklist.ts
//
// Layer 2a: the local threat lists (zero cost per check). A daily job imports OpenPhish and
// URLhaus into the link_blocklist table (see feeds.ts); admins can add rows by hand too.

import { createAdminClient } from '@/lib/supabase/server'
import { hostAndParents } from './domain'

export interface BlocklistHit { kind: 'url' | 'domain'; value: string; source: string }

/** The same page written four ways: http/https and with/without the trailing slash. */
function urlCandidates(u: URL): string[] {
  const out = new Set<string>()
  for (const proto of ['https:', 'http:']) {
    const v = new URL(u.href)
    v.protocol = proto
    const href = v.href
    out.add(href)
    out.add(href.endsWith('/') ? href.slice(0, -1) : href + '/')
  }
  return [...out]
}

/** Looks the link's exact address and its domain (and parent domains) up in the local lists. Database trouble counts as "not listed". */
export async function checkLocalBlocklist(urls: URL[]): Promise<BlocklistHit | null> {
  const urlValues = new Set<string>()
  const domainValues = new Set<string>()
  for (const u of urls) {
    urlCandidates(u).forEach(v => urlValues.add(v))
    hostAndParents(u.hostname).forEach(v => domainValues.add(v))
  }
  const all = [...urlValues, ...domainValues]
  if (all.length === 0) return null

  try {
    const { data, error } = await createAdminClient()
      .from('link_blocklist')
      .select('kind, value, source')
      .in('value', all)
      .limit(20)
    if (error) { console.error('[link-safety] blocklist lookup failed:', error.message); return null }
    for (const row of data ?? []) {
      if (row.kind === 'url' && urlValues.has(row.value)) return row as BlocklistHit
      if (row.kind === 'domain' && domainValues.has(row.value)) return row as BlocklistHit
    }
  } catch (err) {
    console.error('[link-safety] blocklist lookup threw:', err)
  }
  return null
}
