// src/lib/link-safety/short-link.ts
//
// What a Spup short link looks like, and how to recognise one. Pure functions with no
// server imports, so the text renderer (browser) and the server share them.

const BASE = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BASE_URL) || 'https://spup.live'
let baseHost = 'spup.live'
try { baseHost = new URL(BASE).host.toLowerCase() } catch { /* keep default */ }

/** The host short links are shown on, e.g. "spup.live". */
export const APP_HOST = baseHost
/** Links to these hosts are ours: left exactly as typed, never shortened or intercepted. */
export const OWN_HOSTS = new Set([APP_HOST, `www.${APP_HOST.replace(/^www\./, '')}`, 'spup.live', 'www.spup.live'])

export const SLUG_RE = /^[0-9A-Za-z]{4,12}$/

/** "https://spup.live/l/xK3p9Aq" for a slug. */
export function buildShortUrl(slug: string): string {
  return `https://${APP_HOST}/l/${slug}`
}

/** The slug when `href` is one of our short links (any of our hosts, or this page's own host in dev), otherwise null. */
export function parseShortLink(href: string): string | null {
  let u: URL
  try { u = new URL(href) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase()
  const ours = OWN_HOSTS.has(host) || (typeof window !== 'undefined' && host === window.location.hostname.toLowerCase())
  if (!ours) return null
  const m = u.pathname.match(/^\/l\/([0-9A-Za-z]{4,12})\/?$/)
  return m ? m[1] : null
}

/** True for any address on Spup itself. */
export function isOwnHost(host: string): boolean {
  return OWN_HOSTS.has(host.toLowerCase())
}
