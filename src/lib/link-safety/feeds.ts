// src/lib/link-safety/feeds.ts
//
// Daily import of the open phishing / malware feeds into link_blocklist (Layer 2a).
//   OpenPhish  https://openphish.com/feed.txt                       phishing pages
//   URLhaus    https://urlhaus.abuse.ch/downloads/text_online/      malware pages that are online now
// (URLhaus may ask for a free abuse.ch key: set ABUSECH_AUTH_KEY and it is sent along.)
//
// Each listed page is blocked by its exact address. Its whole domain is also blocked, unless
// it sits on a big shared platform (see SHARED_HOSTING_DOMAINS) where one bad page must not
// take down every honest link. A feed that fails to download changes nothing: yesterday's
// entries stay until a feed succeeds again.

import { createAdminClient } from '@/lib/supabase/server'
import { checkStructure } from './structural'
import { SHARED_HOSTING_DOMAINS } from './config'
import { isSameOrSubdomain } from './domain'

const MAX_LINES = 150_000
const BATCH = 1000
const DOWNLOAD_TIMEOUT_MS = 25_000

interface FeedDef { source: string; url: string; headers?: Record<string, string> }

function feeds(): FeedDef[] {
  const abuse = process.env.ABUSECH_AUTH_KEY
  return [
    { source: 'openphish', url: 'https://openphish.com/feed.txt' },
    { source: 'urlhaus', url: 'https://urlhaus.abuse.ch/downloads/text_online/', headers: abuse ? { 'Auth-Key': abuse } : undefined },
  ]
}

function isSharedPlatform(host: string): boolean {
  for (const d of SHARED_HOSTING_DOMAINS) if (isSameOrSubdomain(host, d)) return true
  return false
}

async function download(def: FeedDef): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS)
  try {
    const res = await fetch(def.url, { signal: ctrl.signal, headers: def.headers, cache: 'no-store' })
    if (!res.ok) { console.error(`[link-safety] ${def.source} feed returned ${res.status}`); return null }
    return await res.text()
  } catch (err) {
    console.error(`[link-safety] ${def.source} feed failed:`, (err as Error)?.name ?? err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

export interface FeedImportResult { source: string; ok: boolean; urls: number; domains: number; removed: number }

export async function importThreatFeeds(): Promise<FeedImportResult[]> {
  const admin = createAdminClient()
  const results: FeedImportResult[] = []

  for (const def of feeds()) {
    const text = await download(def)
    if (!text) { results.push({ source: def.source, ok: false, urls: 0, domains: 0, removed: 0 }); continue }

    const runStart = new Date().toISOString()
    const rows = new Map<string, { kind: 'url' | 'domain'; value: string; source: string; last_seen: string }>()
    let lines = 0
    for (const line of text.split('\n')) {
      if (++lines > MAX_LINES) break
      const raw = line.trim()
      if (!raw || raw.startsWith('#') || !/^https?:\/\//i.test(raw)) continue
      // Feeds list raw IPs and odd hosts too; those are refused at the structural layer anyway.
      let u: URL
      try { u = new URL(raw) } catch { continue }
      const check = checkStructure(u.href)
      if (!check.ok) continue
      const norm = check.url
      rows.set(`url|${norm.href}`, { kind: 'url', value: norm.href, source: def.source, last_seen: runStart })
      const host = norm.hostname.replace(/^www\./, '')
      if (!isSharedPlatform(host)) {
        // Block the host that was listed. Its subdomains are caught too, because a check also looks
        // up every parent of the address it is given.
        rows.set(`domain|${host}`, { kind: 'domain', value: host, source: def.source, last_seen: runStart })
      }
    }

    const all = [...rows.values()]
    let failed = false
    for (let i = 0; i < all.length; i += BATCH) {
      const { error } = await admin.from('link_blocklist').upsert(all.slice(i, i + BATCH), { onConflict: 'kind,value' })
      if (error) { console.error(`[link-safety] ${def.source} upsert failed:`, error.message); failed = true; break }
    }
    if (failed) { results.push({ source: def.source, ok: false, urls: 0, domains: 0, removed: 0 }); continue }

    // Entries this feed no longer lists (taken down / cleaned up) are removed.
    const { count } = await admin.from('link_blocklist').delete({ count: 'exact' }).eq('source', def.source).lt('last_seen', runStart)
    results.push({
      source: def.source, ok: true,
      urls: all.filter(r => r.kind === 'url').length, domains: all.filter(r => r.kind === 'domain').length, removed: count ?? 0,
    })
  }
  return results
}
