// src/lib/link-safety/heuristics.ts
//
// Layer 3b: Nigeria-specific impersonation. Scam pages copy the look of a bank, fintech or
// regulator and put its name in the web address: gtbank-update.com, opay-kyc-bonus.net,
// gtbamk.com, cbn-grant.org. This looks for those names (also lightly misspelled, or with
// 0 for o and the like) inside an address that is NOT the real one, and blocks it when it is
// paired with scam wording or is a near-miss spelling of the name.
//
// Short names (cbn, nin, opay...) only count as whole words so "ninja-store.com" is left
// alone; longer names also catch a typo of one character.

import { PROTECTED_BRANDS, BRAND_ALLOW, SCAM_KEYWORDS, type ProtectedBrand } from './config'
import { cleanHost, domainLabel, isSameOrSubdomain, registeredDomain } from './domain'

export type ImpersonationResult =
  | { kind: 'none' }
  /** Uses a protected name, no clear scam signal: allowed, but never marked "safe". */
  | { kind: 'mention'; brand: string; why: string }
  | { kind: 'block'; brand: string; why: string }

const LEET: Record<string, string> = { '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' }

function deLeet(s: string): string {
  return s.replace(/[013457@$]/g, c => LEET[c] ?? c).replace(/rn/g, 'm').replace(/vv/g, 'w')
}

/** True when a and b differ by at most one inserted, deleted, replaced or swapped letter. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > 1) return false
  if (la === lb) {
    let i = 0
    while (i < la && a[i] === b[i]) i++
    if (i === la) return true
    if (a.slice(i + 1) === b.slice(i + 1)) return true // one letter replaced
    return i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2) // two letters swapped
  }
  const [s, l] = la < lb ? [a, b] : [b, a]
  let i = 0
  while (i < s.length && s[i] === l[i]) i++
  return s.slice(i) === l.slice(i + 1) // one letter missing
}

function splitPieces(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9@$]+/).filter(Boolean)
}

interface Hit { brand: ProtectedBrand; how: 'word' | 'joined' | 'typo' }

function matchBrand(brand: ProtectedBrand, pieces: string[], labels: string[]): Hit | null {
  const kw = new Set(SCAM_KEYWORDS)
  for (const token of brand.tokens) {
    // the name as a word of its own: "gtbank-update", "update.opay"
    if (pieces.includes(token)) return { brand, how: 'word' }
    // the name glued to one scam word: "opaykyc", "cbngrant", "bonusopay"
    for (const label of labels) {
      if (label.startsWith(token) && kw.has(label.slice(token.length))) return { brand, how: 'joined' }
      if (label.endsWith(token) && kw.has(label.slice(0, label.length - token.length))) return { brand, how: 'joined' }
    }
    if (token.length >= 6) {
      // a long name sitting inside a longer label: "gtbankupdate", "verify-paystack-login"
      if (labels.some(l => l.includes(token))) return { brand, how: 'word' }
      // a one-letter misspelling of it: "gtbamk", "paystak"
      if ([...pieces, ...labels].some(p => p.length >= 6 && p !== token && withinOneEdit(p, token))) return { brand, how: 'typo' }
    }
  }
  return null
}

export function checkImpersonation(url: URL): ImpersonationResult {
  const host = cleanHost(url.hostname)
  const reg = registeredDomain(host)
  if (BRAND_ALLOW.has(reg) || BRAND_ALLOW.has(host)) return { kind: 'none' }

  // Words in the web address, not counting the ending (.com / .com.ng).
  const hostLabels = host.split('.')
  const suffixCount = reg.split('.').length - domainLabel(host).split('.').length
  const nameLabelsRaw = hostLabels.slice(0, Math.max(1, hostLabels.length - suffixCount))
  const pieces = nameLabelsRaw.flatMap(l => splitPieces(l)).map(deLeet)
  const joinedLabels = nameLabelsRaw.map(l => deLeet(l.replace(/-/g, '')))

  const pathPieces = splitPieces(decodeSafe(url.pathname + ' ' + url.search)).map(deLeet)
  const kw = new Set(SCAM_KEYWORDS)
  const hostHasKeyword =
    pieces.some(p => kw.has(p)) ||
    joinedLabels.some(l => SCAM_KEYWORDS.some(k => k.length >= 5 && l.includes(k)))
  const pathHasKeyword = pathPieces.some(p => kw.has(p))

  for (const brand of PROTECTED_BRANDS) {
    if (brand.legit.some(d => isSameOrSubdomain(host, d))) continue

    const hit = matchBrand(brand, pieces, joinedLabels)
    if (hit) {
      if (hit.how === 'typo') return { kind: 'block', brand: brand.name, why: 'lookalike_spelling' }
      if (hit.how === 'joined' || hostHasKeyword || pathHasKeyword) return { kind: 'block', brand: brand.name, why: 'name_with_scam_wording' }
      return { kind: 'mention', brand: brand.name, why: 'uses_protected_name' }
    }

    // The name only in the page path of someone else's site (a free site builder, say): can be a
    // genuine article about the bank, so it is not blocked - it just can't be marked safe.
    if (brand.tokens.some(t => pathPieces.includes(t)) && pathHasKeyword) {
      return { kind: 'mention', brand: brand.name, why: 'name_in_path_with_scam_wording' }
    }
  }
  return { kind: 'none' }
}

function decodeSafe(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}
