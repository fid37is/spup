// src/lib/urls.ts
// URL detection shared by the text renderer (client) and the link-preview
// service (server). Only http(s):// and www. links count - bare "example.com"
// is left as plain text so ordinary words like "file.txt" never turn into links.

export const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'\x60]+/gi

/** Splits trailing sentence punctuation (and unmatched closing brackets) off a matched URL. */
export function splitUrl(raw: string): { url: string; trailing: string } {
  let url = raw
  let trailing = ''
  for (;;) {
    const last = url[url.length - 1]
    if (!last) break
    const open = last === ')' ? '(' : last === ']' ? '[' : last === '}' ? '{' : null
    if (open) {
      const opens = url.split(open).length - 1
      const closes = url.split(last).length - 1
      if (closes > opens) { trailing = last + trailing; url = url.slice(0, -1); continue }
      break
    }
    if ('.,!?:;\'"'.includes(last)) { trailing = last + trailing; url = url.slice(0, -1); continue }
    break
  }
  return { url, trailing }
}

/** A safe absolute http(s) href for a matched URL, or null when it isn't one. */
export function toHref(url: string): string | null {
  const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`
  if (withProto.length > 2048) return null
  try {
    const u = new URL(withProto)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (u.username || u.password) return null
    if (!u.hostname.includes('.')) return null
    return u.href
  } catch {
    return null
  }
}

/** The first link in a piece of text, as a safe absolute href. */
export function extractFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null
  for (const m of text.matchAll(URL_RE)) {
    const href = toHref(splitUrl(m[0]).url)
    if (href) return href
  }
  return null
}

/** Cache key for a link: the address without its #fragment. */
export function previewKey(href: string): string {
  try { const u = new URL(href); u.hash = ''; return u.href } catch { return href }
}
