// src/lib/link-meta-client.ts
//
// Browser side: asks /api/links/meta for the destination domain and current status of the
// short links on screen. Requests are batched (a feed full of links is one or two calls, not
// one per link) and remembered for the rest of the page's life.

export interface LinkMeta { domain: string; status: 'safe' | 'unknown' | 'blocked'; url: string }

const cache = new Map<string, LinkMeta | null>()
const waiting = new Map<string, Array<(m: LinkMeta | null) => void>>()
let queued = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null
const FRESH_MS = 60_000
const fetchedAt = new Map<string, number>()

/** Already known? (undefined = not asked yet, null = asked, no such link.) */
export function peekLinkMeta(slug: string): LinkMeta | null | undefined {
  const at = fetchedAt.get(slug)
  if (at !== undefined && Date.now() - at > FRESH_MS) return undefined   // stale: ask again
  return cache.get(slug)
}

async function flush() {
  timer = null
  const batch = [...queued]
  queued = new Set()
  for (let i = 0; i < batch.length; i += 25) {
    const slugs = batch.slice(i, i + 25)
    let found: Record<string, LinkMeta> = {}
    try {
      const res = await fetch(`/api/links/meta?slugs=${slugs.join(',')}`)
      if (res.ok) found = ((await res.json()) as { links?: Record<string, LinkMeta> }).links ?? {}
    } catch { /* offline: the links still work, just without the badge */ }
    for (const slug of slugs) {
      const meta = found[slug] ?? null
      cache.set(slug, meta)
      fetchedAt.set(slug, Date.now())
      for (const cb of waiting.get(slug) ?? []) cb(meta)
      waiting.delete(slug)
    }
  }
}

export function getLinkMeta(slug: string): Promise<LinkMeta | null> {
  const known = peekLinkMeta(slug)
  if (known !== undefined) return Promise.resolve(known)
  return new Promise(resolve => {
    const list = waiting.get(slug) ?? []
    list.push(resolve)
    waiting.set(slug, list)
    queued.add(slug)
    if (!timer) timer = setTimeout(flush, 30)
  })
}
