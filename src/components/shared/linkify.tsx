import React from 'react'
import Link from 'next/link'

// Matches MENTION_RE / HASHTAG_RE in lib/utils, combined into one pass so
// mentions and hashtags interleave correctly in source order.
const TOKEN_RE = /(?<![\w@])@[a-zA-Z0-9_]{3,20}\b|(?<![\w#])#[a-zA-Z][a-zA-Z0-9_]{0,49}\b/g

/**
 * Renders post/reply body text with @mentions linking to the mentioned
 * user's profile and #hashtags linking to the matching explore search -
 * previously this text was rendered as-is, so tagging someone or using a
 * hashtag looked identical to plain text: no link, no styling, nothing to
 * click (even though the @mention notification already fired server-side).
 */
export function linkifyPostText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let key = 0

  for (const match of text.matchAll(TOKEN_RE)) {
    const token = match[0]
    const start = match.index ?? 0
    if (start > lastIndex) parts.push(text.slice(lastIndex, start))

    const href = token[0] === '@'
      ? `/user/${token.slice(1)}`
      : `/explore?q=${encodeURIComponent('#' + token.slice(1).toLowerCase())}`

    parts.push(
      <Link
        key={key++}
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