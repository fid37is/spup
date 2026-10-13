// src/lib/link-safety/structural.ts
//
// Layer 1: checks that need no network and no database. Anything that fails here is
// blocked outright.

import net from 'node:net'
import { MAX_URL_LENGTH, PUNYCODE_ALLOWLIST } from './config'
import { parseLink, normalizeUrl } from './normalize'
import { registeredDomain } from './domain'

export type StructuralResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string }

const INTERNAL_SUFFIX = /\.(localhost|local|internal|lan|home|corp|intranet|test|invalid|example)$/i

/** Checks a link and returns it in canonical form. `reason` is for our own audit log, never shown to the sender. */
export function checkStructure(raw: string): StructuralResult {
  const parsed = parseLink(raw)
  if (!parsed.ok) return { ok: false, reason: parsed.reason }
  const url = normalizeUrl(parsed.url)

  if (url.href.length > MAX_URL_LENGTH) return { ok: false, reason: 'too_long' }

  // paypal.com@evil.com - the part before the @ is a decoy, the real host is after it.
  if (url.username || url.password) return { ok: false, reason: 'credentials_in_url' }

  const host = url.hostname.toLowerCase()
  if (!host) return { ok: false, reason: 'invalid' }

  // Raw IP addresses (and internal names) are never a legitimate thing to share, and are how
  // someone would point us at our own network.
  const bare = host.replace(/^\[|\]$/g, '')
  if (net.isIP(bare)) return { ok: false, reason: 'ip_address' }
  if (!host.includes('.') || INTERNAL_SUFFIX.test(host)) return { ok: false, reason: 'internal_host' }

  // After URL parsing a host is lowercase ASCII (IDN is already converted to xn--). Anything else is odd.
  if (!/^[a-z0-9.-]+$/.test(host) || host.includes('..') || host.startsWith('-') || host.startsWith('.')) {
    return { ok: false, reason: 'invalid_host' }
  }
  const tld = host.split('.').pop() ?? ''
  if (!/^(?:[a-z]{2,24}|xn--[a-z0-9-]{2,})$/.test(tld)) return { ok: false, reason: 'invalid_host' }

  // Homograph spoofing: "gtbаnk.com" with a Cyrillic "а" arrives as xn--... Block unless allow-listed.
  if (host.split('.').some(label => label.startsWith('xn--'))) {
    const reg = registeredDomain(host)
    if (!PUNYCODE_ALLOWLIST.has(reg) && !PUNYCODE_ALLOWLIST.has(host)) return { ok: false, reason: 'punycode' }
  }

  // Ports other than the web's own are a phishing/proxy signal.
  if (url.port && url.port !== '80' && url.port !== '443') return { ok: false, reason: 'unusual_port' }

  return { ok: true, url }
}
