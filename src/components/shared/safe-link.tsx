'use client'

import { useEffect, useState } from 'react'
import { ShieldX } from 'lucide-react'
import { APP_HOST } from '@/lib/link-safety/short-link'
import { getLinkMeta, peekLinkMeta, type LinkMeta } from '@/lib/link-meta-client'
import { useTranslation } from '@/lib/i18n/language-context'

/**
 * A Spup short link as it appears in text: "spup.live/l/xK3p9Aq" followed by a badge with the
 * real destination ("example.com ↗"). It opens the "you're leaving Spup" page. If the link was
 * blocked after it was posted, it stops being a link at all.
 */
export default function SafeLink({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const [meta, setMeta] = useState<LinkMeta | null | undefined>(() => peekLinkMeta(slug))

  useEffect(() => {
    let alive = true
    getLinkMeta(slug).then(m => { if (alive) setMeta(m) })
    return () => { alive = false }
  }, [slug])

  const label = `${APP_HOST}/l/${slug}`

  if (meta && meta.status === 'blocked') {
    return (
      <span
        title={t('links.blocked_title')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-error)', fontWeight: 500, wordBreak: 'break-all' }}
      >
        <ShieldX size={13} style={{ flexShrink: 0 }} />
        <span style={{ textDecoration: 'line-through' }}>{label}</span>
        <span style={{ fontSize: 11.5, fontWeight: 600 }}>{t('links.badge_blocked')}</span>
      </span>
    )
  }

  return (
    <>
      <a
        href={`/l/${slug}`}
        target="_blank"
        rel="nofollow ugc noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{ color: 'var(--color-brand)', fontWeight: 500, wordBreak: 'break-all' }}
      >
        {label}
      </a>
      {meta?.domain && (
        <span
          style={{
            display: 'inline-block', marginLeft: 6, padding: '1px 7px', borderRadius: 999, verticalAlign: 'baseline',
            background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)', fontSize: 11.5, fontWeight: 600, lineHeight: 1.5, wordBreak: 'break-all',
          }}
        >
          {meta.domain} ↗
        </span>
      )}
    </>
  )
}
