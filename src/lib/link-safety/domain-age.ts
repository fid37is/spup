// src/lib/link-safety/domain-age.ts
//
// Layer 3a: how long has this domain existed? A site registered last week asking for a bank
// login is the classic scam shape, so brand-new domains are blocked (spec: under 30 days).
//
// Source: RDAP (the free, structured successor to WHOIS, via rdap.org) by default, or
// WhoisXML if WHOISXML_API_KEY is set. Answers are cached in link_domain_age. A registry
// that doesn't answer (many country registries have no RDAP yet) gives "unknown" - never a block.

import { createAdminClient } from '@/lib/supabase/server'
import { DOMAIN_AGE_TTL_MS, DOMAIN_AGE_UNKNOWN_TTL_MS, RDAP_TIMEOUT_MS } from './config'

export interface DomainAge {
  registeredAt: Date | null
  /** Whole days since registration, or null when unknown. */
  ageDays: number | null
}

function daysSince(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), RDAP_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/rdap+json, application/json', ...headers }, cache: 'no-store', redirect: 'follow' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function lookupRdap(domain: string): Promise<Date | null> {
  const json = await fetchJson(`https://rdap.org/domain/${encodeURIComponent(domain)}`)
  const events: Array<{ eventAction?: string; eventDate?: string }> = Array.isArray(json?.events) ? json.events : []
  const reg = events.find(e => e.eventAction === 'registration')?.eventDate
  const d = reg ? new Date(reg) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}

async function lookupWhoisXml(domain: string): Promise<Date | null> {
  const key = process.env.WHOISXML_API_KEY
  if (!key) return null
  const json = await fetchJson(`https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=${encodeURIComponent(key)}&domainName=${encodeURIComponent(domain)}&outputFormat=JSON`)
  const rec = json?.WhoisRecord
  const raw: string | undefined = rec?.createdDateNormalized ?? rec?.registryData?.createdDateNormalized ?? rec?.createdDate ?? rec?.registryData?.createdDate
  const d = raw ? new Date(raw) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}

/** Age of a registered domain (e.g. "example.com.ng"). Never throws. */
export async function getDomainAge(domain: string): Promise<DomainAge> {
  const admin = createAdminClient()
  try {
    const { data: cached } = await admin.from('link_domain_age').select('registered_at, checked_at').eq('domain', domain).maybeSingle()
    if (cached) {
      const fresh = Date.now() - new Date(cached.checked_at).getTime() < (cached.registered_at ? DOMAIN_AGE_TTL_MS : DOMAIN_AGE_UNKNOWN_TTL_MS)
      if (fresh) {
        const d = cached.registered_at ? new Date(cached.registered_at) : null
        return { registeredAt: d, ageDays: d ? daysSince(d) : null }
      }
    }
  } catch { /* fall through to a live lookup */ }

  const source = process.env.WHOISXML_API_KEY ? 'whoisxml' : 'rdap'
  const registeredAt = source === 'whoisxml' ? (await lookupWhoisXml(domain)) ?? (await lookupRdap(domain)) : await lookupRdap(domain)

  try {
    await admin.from('link_domain_age').upsert({
      domain,
      registered_at: registeredAt ? registeredAt.toISOString() : null,
      source,
      checked_at: new Date().toISOString(),
    })
  } catch { /* the cache is an optimisation only */ }

  return { registeredAt, ageDays: registeredAt ? daysSince(registeredAt) : null }
}
