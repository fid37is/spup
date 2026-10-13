// src/lib/link-safety/resolve.ts
//
// Shortener expansion (Layer 1). A link like bit.ly/3xYz tells you nothing, so for known
// shortening services we follow the redirects on the server and judge the REAL destination.
//
// The address in a post is chosen by a stranger, so this is a way to make our server call
// somewhere for them (SSRF). Every request therefore goes through the same guards the
// link-preview fetcher uses: http/https only, ports 80/443 only, no user:pass@, and the
// hostname is resolved by OUR lookup at connect time with every returned address required
// to be public (this also defeats DNS rebinding). Redirects are followed by hand so each hop
// is re-checked, and only the response headers are read - never a body.

import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import { isBlockedIp } from '@/lib/link-preview-fetch'
import { SHORTENER_DOMAINS, MAX_REDIRECT_HOPS } from './config'
import { cleanHost, isSameOrSubdomain } from './domain'
import { checkStructure } from './structural'

const USER_AGENT = 'Mozilla/5.0 (compatible; SpupLinkSafety/1.0; +https://spup.live)'
const HOP_TIMEOUT_MS = 4000
const TOTAL_TIMEOUT_MS = 9000

export function isShortenerHost(host: string): boolean {
  const h = cleanHost(host)
  for (const d of SHORTENER_DOMAINS) if (isSameOrSubdomain(h, d)) return true
  return false
}

type LookupCb = (err: NodeJS.ErrnoException | null, address?: any, family?: number) => void

/** DNS lookup that refuses to hand back an internal address. */
function guardedLookup(hostname: string, options: any, cb: LookupCb) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return cb(err)
    if (!addrs.length || addrs.some(a => isBlockedIp(a.address))) {
      return cb(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }) as NodeJS.ErrnoException)
    }
    if (options && options.all) return cb(null, addrs)
    cb(null, addrs[0].address, addrs[0].family)
  })
}

interface HopResult { status: number; location?: string }

function requestHeaders(u: URL, method: 'HEAD' | 'GET', deadline: number): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return reject(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))
    const lib = u.protocol === 'https:' ? https : http
    const req = lib.request(
      u,
      {
        method,
        timeout: Math.min(HOP_TIMEOUT_MS, remaining),
        lookup: guardedLookup as any,
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*', 'Accept-Encoding': 'identity' },
      },
      res => {
        // Headers are all we need. Drop the body without reading it.
        const status = res.statusCode || 0
        const location = typeof res.headers.location === 'string' ? res.headers.location : undefined
        res.destroy()
        resolve({ status, location })
      },
    )
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })))
    req.on('error', reject)
    req.end()
  })
}

export type ExpandResult =
  | { kind: 'ok'; url: URL; hops: number }           // not a shortener, or fully expanded
  | { kind: 'blocked'; reason: string }              // a hop was unsafe (internal address, bad structure, loop...)
  | { kind: 'unresolved'; reason: string }           // couldn't tell where it goes (network error, no redirect)

/** Follows a shortener's redirects (up to MAX_REDIRECT_HOPS), re-checking every hop. A link that isn't a shortener is returned as is. */
export async function expandShortener(start: URL): Promise<ExpandResult> {
  if (!isShortenerHost(start.hostname)) return { kind: 'ok', url: start, hops: 0 }

  const deadline = Date.now() + TOTAL_TIMEOUT_MS
  let current = start
  let hops = 0

  while (isShortenerHost(current.hostname)) {
    if (hops >= MAX_REDIRECT_HOPS) return { kind: 'blocked', reason: 'redirect_chain_too_long' }
    hops++

    let res: HopResult
    try {
      res = await requestHeaders(current, 'HEAD', deadline)
      // Some shorteners answer HEAD with an error or a page instead of the redirect: ask again with GET.
      if (!res.location && (res.status === 405 || res.status === 403 || res.status === 400 || res.status === 501 || res.status === 200)) {
        res = await requestHeaders(current, 'GET', deadline)
      }
    } catch (err: any) {
      if (err?.code === 'EBLOCKED') return { kind: 'blocked', reason: 'redirects_to_internal_address' }
      return { kind: 'unresolved', reason: `unreachable:${err?.code ?? 'error'}` }
    }

    if (res.status < 300 || res.status >= 400 || !res.location) {
      // It answered but did not redirect: we still don't know where it leads.
      return { kind: 'unresolved', reason: `no_redirect:${res.status}` }
    }

    let next: URL
    try { next = new URL(res.location, current) } catch { return { kind: 'blocked', reason: 'bad_redirect_target' } }

    // Every hop has to pass the same structural rules as the link that was posted.
    const check = checkStructure(next.href)
    if (!check.ok) return { kind: 'blocked', reason: `redirect_${check.reason}` }
    current = check.url
  }

  return { kind: 'ok', url: current, hops }
}
