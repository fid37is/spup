// src/lib/link-safety/normalize.ts
//
// Turns whatever someone typed into one canonical form, so the same page always maps to
// the same stored link (and the same verdict), however it was written.

import { MAX_URL_LENGTH, TRACKING_PARAMS } from './config'

export type ParseResult =
  | { ok: true; url: URL }
  | { ok: false; reason: 'protocol' | 'invalid' | 'too_long' }

const DANGEROUS_SCHEME = /^\s*(javascript|data|vbscript|file|ftp|blob|about|chrome|intent|market|content):/i

/**
 * Parses a link. Accepts "https://x.com", "http://x.com" and bare "www.x.com" / "x.com/path"
 * (website fields). Every other scheme - ftp:, javascript:, data:, ... - is refused.
 */
export function parseLink(raw: string): ParseResult {
  const text = raw.trim()
  if (!text) return { ok: false, reason: 'invalid' }
  if (text.length > MAX_URL_LENGTH) return { ok: false, reason: 'too_long' }
  if (DANGEROUS_SCHEME.test(text)) return { ok: false, reason: 'protocol' }

  let candidate = text
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    // Has a scheme: only http/https pass (checked below via url.protocol).
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(candidate) && !/^[^/?#]*\.[^/?#]*:\d+(\/|$)/.test(candidate)) {
    // "mailto:x", "tel:x", "whatsapp:x" ... - anything with a scheme and no "//" that is not "host:port".
    return { ok: false, reason: 'protocol' }
  } else {
    candidate = `https://${candidate.replace(/^\/+/, '')}`
  }

  let url: URL
  try { url = new URL(candidate) } catch { return { ok: false, reason: 'invalid' } }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'protocol' }
  return { ok: true, url }
}

/**
 * Canonical form: lower-case host without a trailing dot, no #fragment, no default port,
 * tracking parameters (utm_*, fbclid, gclid...) removed. The path and the other parameters
 * are kept exactly - they decide which page it is.
 */
export function normalizeUrl(input: URL): URL {
  const u = new URL(input.href)
  u.hash = ''
  u.hostname = u.hostname.replace(/\.$/, '')
  if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) u.port = ''
  const keep: Array<[string, string]> = []
  let changed = false
  for (const [k, v] of u.searchParams) {
    if (TRACKING_PARAMS.test(k)) { changed = true; continue }
    keep.push([k, v])
  }
  if (changed) {
    u.search = ''
    for (const [k, v] of keep) u.searchParams.append(k, v)
  }
  return u
}

/** The host without "www.", the form stored in links.domain. */
export function displayDomain(u: URL): string {
  return u.hostname.toLowerCase().replace(/^www\./, '')
}
