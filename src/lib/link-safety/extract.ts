// src/lib/link-safety/extract.ts
//
// Finds the links in a piece of text and rewrites them. Pure functions (no server imports):
// the server uses them for posts and bios, and the chat uses them in the browser, because a
// direct message is encrypted before it leaves the phone and the server never sees its text.

import { URL_RE, splitUrl } from '@/lib/urls'

export interface LinkToken {
  /** The link as typed, without trailing punctuation. */
  raw: string
  start: number
  end: number
}

/** Every http(s):// or www. link in `text`, in order, with trailing punctuation left out. */
export function extractLinkTokens(text: string): LinkToken[] {
  const out: LinkToken[] = []
  for (const m of text.matchAll(new RegExp(URL_RE.source, 'gi'))) {
    const start = m.index ?? 0
    const { url } = splitUrl(m[0])
    if (!url) continue
    out.push({ raw: url, start, end: start + url.length })
  }
  return out
}

/** Replaces tokens (by their position) using `replacements`, keyed by the raw link text. Links without an entry are left alone. */
export function applyReplacements(text: string, tokens: LinkToken[], replacements: Map<string, string>): string {
  let out = ''
  let last = 0
  for (const t of tokens) {
    const rep = replacements.get(t.raw)
    if (rep === undefined) continue
    out += text.slice(last, t.start) + rep
    last = t.end
  }
  return out + text.slice(last)
}

/**
 * The "couldn't verify this link" form: shown as plain text that the app will not turn into a
 * link. The scheme is dropped (the text renderer only links http(s):// and www.), and a leading
 * "www." gets an invisible zero-width space so it stops matching too.
 */
export function defangUrl(raw: string): string {
  const noScheme = raw.replace(/^https?:\/\//i, '')
  return /^www\./i.test(noScheme) ? noScheme.replace(/^www/i, m => m + '\u200B') : noScheme
}
