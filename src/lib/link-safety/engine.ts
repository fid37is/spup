// src/lib/link-safety/engine.ts
//
// The safety engine: one link in, one verdict out. Checks run from cheapest to most
// expensive, and the first that finds a problem stops the rest.
//
//   Layer 1  structure     protocol, punycode, credentials, IPs, ports      (no network)
//            expansion     follow bit.ly / t.co / ... to the real address    (guarded fetch)
//   Layer 2  local lists   OpenPhish + URLhaus + manual entries              (database)
//   Layer 3  impersonation Nigerian banks / fintechs / regulators            (no network)
//            domain age    registered in the last 30 days?                   (RDAP / WHOIS)
//   Layer 2  Google Web Risk  live malware / phishing check                  (paid API, last)
//
// Verdicts:
//   allow       'safe'    trusted domain, or every layer ran and found nothing
//   allow       'unknown' nothing bad found, but something couldn't be confirmed (no API key,
//                         unknown domain age, a protected name was mentioned)
//   block       a layer found a problem. `reason` is for our audit log only.
//   unverified  a check we depend on is down: fail open - the post goes out but the link is
//               stored as plain, non-clickable text rather than an active redirect.

import { TRUSTED_DOMAINS, NEW_DOMAIN_DAYS, NEW_DOMAIN_ACTION } from './config'
import { displayDomain } from './normalize'
import { isSameOrSubdomain, registeredDomain } from './domain'
import { checkStructure } from './structural'
import { expandShortener } from './resolve'
import { checkLocalBlocklist } from './blocklist'
import { checkImpersonation } from './heuristics'
import { getDomainAge } from './domain-age'
import { checkWebRisk, webRiskEnabled } from './web-risk'

export type Verdict =
  | { kind: 'allow'; status: 'safe' | 'unknown'; normalized: string; resolved: string; domain: string; reason: string | null }
  | { kind: 'block'; reason: string; normalized: string | null; resolved: string | null; domain: string | null }
  | { kind: 'invalid'; reason: string }
  | { kind: 'unverified'; reason: string; normalized: string }

/** Structural failures that mean "that isn't a link at all" rather than "that's an unsafe link". */
const NOT_A_LINK = new Set(['invalid', 'too_long', 'protocol'])

export function isTrustedDomain(host: string): boolean {
  return TRUSTED_DOMAINS.some(d => isSameOrSubdomain(host, d))
}

export async function evaluateUrl(raw: string): Promise<Verdict> {
  // ── Layer 1: structure ──
  const structure = checkStructure(raw)
  if (!structure.ok) {
    return NOT_A_LINK.has(structure.reason)
      ? { kind: 'invalid', reason: structure.reason }
      : { kind: 'block', reason: structure.reason, normalized: null, resolved: null, domain: null }
  }
  const normalizedUrl = structure.url
  const normalized = normalizedUrl.href

  // ── Layer 1: shortener expansion ──
  const expanded = await expandShortener(normalizedUrl)
  if (expanded.kind === 'blocked') {
    return { kind: 'block', reason: expanded.reason, normalized, resolved: null, domain: displayDomain(normalizedUrl) }
  }
  if (expanded.kind === 'unresolved') {
    // We can't tell where it leads, and a short link can be pointed somewhere else later:
    // no active redirect for it.
    return { kind: 'unverified', reason: expanded.reason, normalized }
  }
  const resolvedUrl = expanded.url
  const resolved = resolvedUrl.href
  const domain = displayDomain(resolvedUrl)
  const host = resolvedUrl.hostname

  const blockedResult = (reason: string): Verdict => ({ kind: 'block', reason, normalized, resolved, domain })

  // ── Layer 2: local threat lists ──
  const listed = await checkLocalBlocklist(normalized === resolved ? [normalizedUrl] : [normalizedUrl, resolvedUrl])
  if (listed) return blockedResult(`blocklist:${listed.source}:${listed.kind}`)

  // A trusted site needs nothing further (an exact bad page on it was already caught above).
  if (isTrustedDomain(host)) {
    return { kind: 'allow', status: 'safe', normalized, resolved, domain, reason: 'trusted_domain' }
  }

  // ── Layer 3: impersonation of a bank, fintech or regulator ──
  const softFlags: string[] = []
  const imp = checkImpersonation(resolvedUrl)
  if (imp.kind === 'block') return blockedResult(`impersonation:${imp.brand}:${imp.why}`)
  if (imp.kind === 'mention') softFlags.push(`brand:${imp.brand}`)

  // ── Layer 3: domain age ──
  const age = await getDomainAge(registeredDomain(host))
  if (age.ageDays !== null && age.ageDays < NEW_DOMAIN_DAYS) {
    if (NEW_DOMAIN_ACTION === 'block') return blockedResult(`new_domain:${age.ageDays}d`)
    softFlags.push(`new_domain:${age.ageDays}d`)
  }

  // ── Layer 2: Google Web Risk (last: it is the one that costs money) ──
  const risk = await checkWebRisk(resolved)
  if (risk.status === 'threat') return blockedResult(`web_risk:${risk.types.join('+')}`)
  if (risk.status === 'unavailable') {
    return { kind: 'unverified', reason: 'web_risk_unavailable', normalized }
  }

  const fullyChecked = webRiskEnabled() && risk.status === 'clean' && age.ageDays !== null && softFlags.length === 0
  return {
    kind: 'allow',
    status: fullyChecked ? 'safe' : 'unknown',
    normalized, resolved, domain,
    reason: softFlags.length ? softFlags.join(',') : null,
  }
}
