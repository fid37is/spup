import React from 'react'
import Link from 'next/link'
import { URL_RE, splitUrl, toHref } from '@/lib/urls'

// Matches MENTION_RE / HASHTAG_RE in lib/utils, combined into one pass so
// mentions and hashtags interleave correctly in source order.
// URLs are matched first (they start earlier in the text), so a #fragment inside a link stays part of the link.
const TOKEN_RE = new RegExp(`${URL_RE.source}|(?<![\\w@])@[a-zA-Z0-9_]{3,20}\\b|(?<![\\w#])#[a-zA-Z][a-zA-Z0-9_]{0,49}\\b`, 'gi')

function shortUrl(u: string): string {
  const s = u.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  return s.length > 40 ? s.slice(0, 39) + '…' : s
}

/**
 * Renders post/reply body text with @mentions linking to the mentioned
 * user's profile and #hashtags linking to the matching explore search -
 * previously this text was rendered as-is, so tagging someone or using a
 * hashtag looked identical to plain text: no link, no styling, nothing to
 * click (even though the @mention notification already fired server-side).
 */
function linkifySegment(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let key = 0

  for (const match of text.matchAll(TOKEN_RE)) {
    const token = match[0]
    const start = match.index ?? 0
    if (start > lastIndex) parts.push(text.slice(lastIndex, start))

    if (/^(https?:\/\/|www\.)/i.test(token)) {
      const { url, trailing } = splitUrl(token)
      const link = toHref(url)
      if (link) {
        parts.push(
          <a
            key={`${keyPrefix}${key++}`}
            href={link}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            onClick={e => e.stopPropagation()}
            style={{ color: 'var(--color-brand)', fontWeight: 500, wordBreak: 'break-all' }}
          >
            {shortUrl(url)}
          </a>
        )
        if (trailing) parts.push(trailing)
      } else {
        parts.push(token)
      }
      lastIndex = start + token.length
      continue
    }

    const href = token[0] === '@'
      ? `/user/${token.slice(1)}`
      : `/explore?q=${encodeURIComponent('#' + token.slice(1).toLowerCase())}`

    parts.push(
      <Link
        key={`${keyPrefix}${key++}`}
        href={href}
        onClick={e => e.stopPropagation()}
        style={{ color: 'var(--color-brand)', fontWeight: 500 }}
      >
        {token}
      </Link>
    )
    lastIndex = start + token.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

// *bold*, WhatsApp style. The opening * must be followed by a non-space and the
// closing * preceded by one, the text between can't contain * or a line break,
// and both * must sit at a word edge - so "2*3*4" and "a * b * c" stay as typed.
const BOLD_RE = /(?<![\p{L}\p{N}_*])\*(?=[^\s*])([^*\n]*[^\s*])\*(?![\p{L}\p{N}_*])/gu
const URL_ANYWHERE_RE = new RegExp(URL_RE.source, 'gi')

/**
 * Renders post/reply body text: *bold* runs become bold (the asterisks are
 * hidden), and @mentions, #hashtags and links work inside and outside them.
 * A * that falls inside a URL is left alone.
 */
export function linkifyPostText(text: string): React.ReactNode[] {
  const urlRanges = [...text.matchAll(URL_ANYWHERE_RE)].map(m => [m.index ?? 0, (m.index ?? 0) + m[0].length])
  const out: React.ReactNode[] = []
  let last = 0
  let seg = 0

  for (const m of text.matchAll(BOLD_RE)) {
    const start = m.index ?? 0
    const end = start + m[0].length
    if (urlRanges.some(([a, b]) => start < b && end > a)) continue
    if (start > last) out.push(...linkifySegment(text.slice(last, start), `s${seg++}-`))
    out.push(<strong key={`b${seg++}`} style={{ fontWeight: 700 }}>{linkifySegment(m[1], 'in-')}</strong>)
    last = end
  }
  if (last < text.length) out.push(...linkifySegment(text.slice(last), `s${seg++}-`))
  return out
}

const OPEN_BOLD_RE = /(?<![\p{L}\p{N}_*])\*(?=[^\s*])[^*\n]*$/u

/**
 * For text that was cut short ("Read more"): if the cut landed inside a bold
 * run, close it, so the visible part still shows bold instead of a stray *.
 */
export function closeCutBold(text: string): string {
  let lastEnd = 0
  for (const m of text.matchAll(BOLD_RE)) lastEnd = (m.index ?? 0) + m[0].length
  return OPEN_BOLD_RE.test(text.slice(lastEnd)) ? text + '*' : text
}