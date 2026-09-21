// src/lib/request-context.ts
//
// Reads WHERE a request came from (country + state) and WHAT it came from
// (device / OS / browser), for admin analytics. Server-side only.
//
// Privacy: the IP address is never read or stored - only the country and
// region the hosting platform already worked out from it.
//
// Sources, best first:
//   1. Cloudflare's request context (region NAME, e.g. "Lagos")   <- Spup runs on Cloudflare
//   2. Cloudflare headers: cf-ipcountry (always), cf-region (if the "Add visitor
//      location headers" Managed Transform is on in the Cloudflare dashboard)
//   3. Vercel headers: x-vercel-ip-country, x-vercel-ip-country-region (a code)

import { headers } from 'next/headers'
import { parseUserAgent, type DeviceInfo } from '@/lib/user-agent'
import { canonicalState } from '@/lib/nigeria'

export interface RequestContext {
  country: string | null   // ISO 3166-1 alpha-2, upper case
  region: string | null    // state / region name
  device: DeviceInfo
}

// Cloudflare uses XX for "unknown" and T1 for Tor; neither is a real country.
const NOT_A_COUNTRY = new Set(['XX', 'T1', 'ZZ'])

function cleanCountry(v: unknown): string | null {
  const c = typeof v === 'string' ? v.trim().toUpperCase() : ''
  return /^[A-Z]{2}$/.test(c) && !NOT_A_COUNTRY.has(c) ? c : null
}

function cleanRegion(v: unknown, country: string | null): string | null {
  const r = typeof v === 'string' ? v.trim() : ''
  if (!r || r.length > 80) return null
  // In Nigeria always store the canonical state name, whatever form the host sent.
  if (country === 'NG') return canonicalState(r) ?? r
  return r
}

async function cloudflareGeo(): Promise<{ country?: unknown; region?: unknown }> {
  try {
    const mod = await import('@opennextjs/cloudflare')
    const cf = (mod.getCloudflareContext() as unknown as { cf?: { country?: unknown; region?: unknown } })?.cf
    return { country: cf?.country, region: cf?.region }
  } catch {
    return {}   // not running on Cloudflare (e.g. plain `next dev`)
  }
}

export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers()
  const cf = await cloudflareGeo()

  const country =
    cleanCountry(cf.country) ??
    cleanCountry(h.get('cf-ipcountry')) ??
    cleanCountry(h.get('x-vercel-ip-country'))

  const region = cleanRegion(
    cf.region ?? h.get('cf-region') ?? h.get('x-vercel-ip-country-region'),
    country,
  )

  return { country, region, device: parseUserAgent(h.get('user-agent')) }
}
