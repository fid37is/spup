// src/lib/link-preview-fetch.ts
// Fetches a web page and pulls out its Open Graph card (title, description,
// image, site name). Server-only. The URL is chosen by whoever wrote a post, so
// every request goes through the guards below - otherwise this would be a way to
// make our server call internal addresses (cloud metadata, localhost, the
// database) on someone else's behalf (SSRF).
//
//  - http/https only, ports 80/443 only, no user:pass@ in the URL
//  - the hostname is resolved by OUR lookup at connect time and every returned
//    address must be public. Checking at connect time (not before) also defeats
//    DNS rebinding, and redirects are followed by hand so each hop is re-checked
//  - 5s socket timeout, 8s overall, <=600 KB read, HTML responses only

import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import net from 'node:net'
import zlib from 'node:zlib'

export interface LinkPreviewData {
  final_url: string
  title: string | null
  description: string | null
  image_url: string | null
  site_name: string | null
}

const USER_AGENT = 'Mozilla/5.0 (compatible; SpupLinkPreview/1.0; +https://spup.live)'
const MAX_BYTES = 600 * 1024
const MAX_REDIRECTS = 4
const SOCKET_TIMEOUT_MS = 5000
const TOTAL_TIMEOUT_MS = 8000

// ─── Address guard ────────────────────────────────────────────────────────────

function ipv4Blocked(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b, c] = p
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||        // carrier-grade NAT
    (a === 169 && b === 254) ||                  // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224                                     // multicast + reserved
  )
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return ipv4Blocked(ip)
  if (!net.isIPv6(ip)) return true
  const v = ip.toLowerCase()
  const dotted = v.match(/^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) return ipv4Blocked(dotted[1])
  const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hex) {
    const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16)
    return ipv4Blocked(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
  }
  if (v === '::' || v === '::1') return true
  return (
    /^f[cd]/.test(v) ||                 // unique local fc00::/7
    /^fe[89ab]/.test(v) ||              // link-local fe80::/10
    v.startsWith('ff') ||               // multicast
    v.startsWith('2002:') ||            // 6to4 (embeds an IPv4 address)
    v.startsWith('2001:0:') || v.startsWith('2001:db8') ||
    v.startsWith('64:ff9b')             // NAT64
  )
}

type LookupCb = (err: NodeJS.ErrnoException | null, address?: any, family?: number) => void

function makeLookup(allowPrivate: boolean) {
  return (hostname: string, options: any, cb: LookupCb) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
      if (err) return cb(err)
      if (!allowPrivate && (!addrs.length || addrs.some(a => isBlockedIp(a.address)))) {
        return cb(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }) as NodeJS.ErrnoException)
      }
      if (options && options.all) return cb(null, addrs)
      cb(null, addrs[0].address, addrs[0].family)
    })
  }
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

interface Hop { redirect?: string; html?: string; contentType?: string }

function requestOnce(u: URL, allowPrivate: boolean, deadline: number): Promise<Hop> {
  return new Promise((resolve, reject) => {
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return reject(new Error('bad protocol'))
    if (u.username || u.password) return reject(new Error('credentials in url'))
    if (u.port && u.port !== '80' && u.port !== '443') return reject(new Error('bad port'))
    const host = u.hostname.replace(/^\[|\]$/g, '')
    if (!allowPrivate && net.isIP(host) && isBlockedIp(host)) return reject(new Error('blocked address'))

    const lib = u.protocol === 'https:' ? https : http
    const req = lib.request(
      u,
      {
        method: 'GET',
        timeout: SOCKET_TIMEOUT_MS,
        lookup: makeLookup(allowPrivate) as any,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'Accept-Language': 'en',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      res => {
        const status = res.statusCode || 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          return resolve({ redirect: new URL(res.headers.location, u).href })
        }
        if (status < 200 || status >= 300) { res.resume(); return reject(new Error(`status ${status}`)) }

        const contentType = String(res.headers['content-type'] || '')
        if (!/text\/html|application\/xhtml/i.test(contentType)) { res.resume(); return reject(new Error('not html')) }

        let stream: NodeJS.ReadableStream = res
        const enc = String(res.headers['content-encoding'] || '').toLowerCase()
        if (enc === 'gzip') stream = res.pipe(zlib.createGunzip())
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate())
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress())

        const chunks: Buffer[] = []
        let size = 0
        let done = false
        const finish = () => {
          if (done) return
          done = true
          clearTimeout(timer)
          req.destroy()
          const m = contentType.match(/charset=([\w-]+)/i)
          let html: string
          try { html = new TextDecoder(m ? m[1] : 'utf-8').decode(Buffer.concat(chunks)) }
          catch { html = Buffer.concat(chunks).toString('utf8') }
          resolve({ html, contentType })
        }
        stream.on('data', (c: Buffer) => {
          chunks.push(c); size += c.length
          // Everything we need lives in <head>; stop as soon as it closes.
          if (size >= MAX_BYTES || /<\/head>/i.test(c.toString('latin1'))) finish()
        })
        stream.on('end', finish)
        stream.on('error', err => { if (!done) { done = true; clearTimeout(timer); reject(err) } })
      },
    )
    const timer = setTimeout(() => req.destroy(new Error('timeout')), Math.max(1, deadline - Date.now()))
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', err => { clearTimeout(timer); reject(err) })
    req.end()
  })
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&nbsp;/gi, ' ').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
}
function safeChar(n: number): string {
  try { return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '' } catch { return '' }
}
function clean(s: string | undefined, max: number): string | null {
  if (!s) return null
  const out = decodeEntities(s).replace(/\s+/g, ' ').trim()
  if (!out) return null
  return out.length > max ? out.slice(0, max - 1).trimEnd() + '…' : out
}

export function parsePreview(html: string, finalUrl: string): LinkPreviewData | null {
  const end = html.search(/<\/head>/i)
  const head = html.slice(0, end > 0 ? end : 300_000)

  const meta: Record<string, string> = {}
  for (const m of head.matchAll(/<meta\s+([^>]*?)\/?>/gi)) {
    const attrs: Record<string, string> = {}
    for (const a of m[1].matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? ''
    }
    const key = (attrs.property || attrs.name || '').toLowerCase()
    if (key && attrs.content !== undefined && !(key in meta)) meta[key] = attrs.content
  }

  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const title = clean(meta['og:title'] || meta['twitter:title'] || titleTag, 200)
  const description = clean(meta['og:description'] || meta['twitter:description'] || meta['description'], 300)
  const site = clean(meta['og:site_name'], 80) || new URL(finalUrl).hostname.replace(/^www\./, '')

  let image: string | null = null
  const rawImage = (meta['og:image'] || meta['og:image:secure_url'] || meta['og:image:url'] ||
    meta['twitter:image'] || meta['twitter:image:src'] || '').trim()
  if (rawImage) {
    try {
      const iu = new URL(decodeEntities(rawImage), finalUrl)
      if (iu.protocol === 'http:') iu.protocol = 'https:'   // browsers block mixed content
      if (iu.protocol === 'https:' && iu.href.length <= 2048) image = iu.href
    } catch { /* ignore a malformed image address */ }
  }

  if (!title && !image) return null
  return { final_url: finalUrl, title, description, image_url: image, site_name: site }
}

// ─── Public entry ─────────────────────────────────────────────────────────────

/** Fetch + parse one link. Resolves null when the page has no usable card; rejects on network errors. */
export async function fetchLinkPreview(url: string, opts: { allowPrivate?: boolean } = {}): Promise<LinkPreviewData | null> {
  const allowPrivate = !!opts.allowPrivate
  const deadline = Date.now() + TOTAL_TIMEOUT_MS
  let current = new URL(url)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await requestOnce(current, allowPrivate, deadline)
    if (res.redirect) { current = new URL(res.redirect); continue }
    return parsePreview(res.html || '', current.href)
  }
  throw new Error('too many redirects')
}
