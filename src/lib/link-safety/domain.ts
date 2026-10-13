// src/lib/link-safety/domain.ts
//
// Small, dependency-free domain helpers. There is no public-suffix list bundled, so
// registeredDomain() knows the multi-part endings that matter for Nigerian and nearby
// traffic (com.ng, gov.ng...) plus the common international ones; everything else is
// treated as a normal two-part "name.tld".

const MULTI_PART_SUFFIXES = new Set([
  'com.ng', 'org.ng', 'gov.ng', 'edu.ng', 'net.ng', 'sch.ng', 'mil.ng', 'name.ng', 'mobi.ng', 'i.ng',
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk',
  'com.gh', 'org.gh', 'gov.gh', 'edu.gh',
  'co.za', 'org.za', 'gov.za', 'ac.za',
  'co.ke', 'or.ke', 'go.ke', 'ac.ke',
  'com.au', 'net.au', 'org.au', 'co.nz', 'co.in', 'com.br', 'com.cn', 'co.jp',
])

/** Lower-cases, drops a trailing dot and a leading "www.". */
export function cleanHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
}

/** "login.gtbank-update.com.ng" -> "gtbank-update.com.ng". IP addresses are returned unchanged. */
export function registeredDomain(host: string): string {
  const h = cleanHost(host)
  const labels = h.split('.')
  if (labels.length <= 2) return h
  const lastTwo = labels.slice(-2).join('.')
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return labels.slice(-3).join('.')
  return lastTwo
}

/** The registered domain's name part: "gtbank-update" for gtbank-update.com.ng. */
export function domainLabel(host: string): string {
  const reg = registeredDomain(host)
  const labels = reg.split('.')
  const suffixParts = MULTI_PART_SUFFIXES.has(labels.slice(-2).join('.')) ? 2 : 1
  return labels.slice(0, Math.max(1, labels.length - suffixParts)).join('.')
}

/** True when `host` is `domain` or a subdomain of it. */
export function isSameOrSubdomain(host: string, domain: string): boolean {
  const h = cleanHost(host)
  const d = cleanHost(domain)
  return h === d || h.endsWith('.' + d)
}

/** Every parent of a host, most specific first: a.b.evil.com -> [a.b.evil.com, b.evil.com, evil.com]. */
export function hostAndParents(host: string): string[] {
  const labels = cleanHost(host).split('.')
  const out: string[] = []
  for (let i = 0; i < labels.length - 1; i++) out.push(labels.slice(i).join('.'))
  return out
}
