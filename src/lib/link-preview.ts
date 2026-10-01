// src/lib/link-preview.ts
// Cached link previews. A link is fetched at most once a week (failures are
// retried after 6 hours); everyone after that reads the stored card.

import { createAdminClient } from '@/lib/supabase/server'
import { fetchLinkPreview } from '@/lib/link-preview-fetch'
import { previewKey } from '@/lib/urls'

export interface LinkPreview {
  url: string
  title: string | null
  description: string | null
  image_url: string | null
  site_name: string | null
}

const OK_TTL_MS = 7 * 24 * 60 * 60 * 1000
const FAIL_TTL_MS = 6 * 60 * 60 * 1000

function fromRow(url: string, r: any): LinkPreview | null {
  return r.ok ? { url, title: r.title, description: r.description, image_url: r.image_url, site_name: r.site_name } : null
}

/** The stored card for a link, or `undefined` when nothing fresh is cached. */
export async function getCachedPreview(href: string): Promise<LinkPreview | null | undefined> {
  const key = previewKey(href)
  const { data: row } = await createAdminClient().from('link_previews').select('*').eq('url', key).maybeSingle()
  if (!row) return undefined
  const age = Date.now() - new Date(row.fetched_at).getTime()
  if (age > (row.ok ? OK_TTL_MS : FAIL_TTL_MS)) return undefined
  return fromRow(href, row)
}

/** Fetch the page now, store the result (including "no card"), and return it. */
export async function refreshPreview(href: string): Promise<LinkPreview | null> {
  const key = previewKey(href)
  let data = null
  try { data = await fetchLinkPreview(key) } catch { data = null }
  await createAdminClient().from('link_previews').upsert({
    url: key,
    final_url: data?.final_url ?? null,
    title: data?.title ?? null,
    description: data?.description ?? null,
    image_url: data?.image_url ?? null,
    site_name: data?.site_name ?? null,
    ok: !!data,
    fetched_at: new Date().toISOString(),
  })
  return data ? { url: href, title: data.title, description: data.description, image_url: data.image_url, site_name: data.site_name } : null
}

/** Cache first, network second. */
export async function getLinkPreview(href: string): Promise<LinkPreview | null> {
  const cached = await getCachedPreview(href)
  return cached !== undefined ? cached : refreshPreview(href)
}
