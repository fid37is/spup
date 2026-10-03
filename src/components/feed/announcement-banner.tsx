'use client'

// src/components/feed/announcement-banner.tsx
//
// The announcement card. Used in the feed under the tabs on phones/tablets
// (variant "feed") and at the top of the right-hand column on desktop (variant
// "sidebar"). Deliberately an inset tinted card with an icon, unlike a post row or
// an ad, so it is never mistaken for either. Green for a new feature, gold for
// maintenance. Dismissing is the caller's job (onDismiss) - see
// components/layout/announcement-provider.tsx.

import Link from 'next/link'
import { Sparkles, Wrench, X, ArrowRight } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/language-context'
import type { AnnouncementKind, FeedAnnouncement } from '@/lib/announcements'

export const KIND_STYLE: Record<AnnouncementKind, { icon: typeof Sparkles; accent: string; tint: string; border: string; cta: string }> = {
  feature:     { icon: Sparkles, accent: 'var(--color-brand)', tint: 'var(--color-brand-muted)', border: 'var(--color-brand-border)', cta: 'var(--color-brand)' },
  // Gold is a poor text colour on a light background, so on maintenance the
  // accent only colours the icon and the button text stays primary.
  maintenance: { icon: Wrench,   accent: 'var(--color-gold)',  tint: 'var(--color-gold-muted)',  border: 'var(--color-gold-border)',  cta: 'var(--color-text-primary)' },
}

export type AnnouncementCardData = Pick<FeedAnnouncement, 'id' | 'kind' | 'title' | 'body' | 'cta_label' | 'cta_url'>

export function AnnouncementCta({ announcement, preview }: { announcement: AnnouncementCardData; preview?: boolean }) {
  if (!announcement.cta_label || !announcement.cta_url) return null
  const style = {
    display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8,
    fontSize: 13.5, fontWeight: 700, color: KIND_STYLE[announcement.kind].cta, textDecoration: 'none',
  } as const
  const label = <>{announcement.cta_label} <ArrowRight size={14} aria-hidden="true" /></>

  if (preview) return <span style={style}>{label}</span>
  if (announcement.cta_url.startsWith('/')) return <Link href={announcement.cta_url} style={style}>{label}</Link>
  return <a href={announcement.cta_url} target="_blank" rel="noopener noreferrer" style={style}>{label}</a>
}

export default function AnnouncementBanner({
  announcement,
  variant = 'feed',
  preview = false,
  onDismiss,
}: {
  announcement: AnnouncementCardData
  variant?: 'feed' | 'sidebar'
  /** Admin preview: drawn exactly as users see it, but nothing is clickable. */
  preview?: boolean
  onDismiss?: () => void
}) {
  const { t } = useTranslation()
  const style = KIND_STYLE[announcement.kind]
  const Icon = style.icon

  const card = (
    <div style={{
      position: 'relative', display: 'flex', gap: 12, alignItems: 'flex-start',
      padding: '12px 40px 12px 12px', borderRadius: 14,
      background: style.tint, border: `1px solid ${style.border}`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-surface-raised)', border: `1px solid ${style.border}`, color: style.accent,
      }}>
        <Icon size={16} aria-hidden="true" />
      </div>

      <div style={{ minWidth: 0 }}>
        <p style={{
          margin: 0, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
          lineHeight: 1.35, color: 'var(--color-text-primary)', wordBreak: 'break-word',
        }}>
          {announcement.title}
        </p>
        <p style={{
          margin: '2px 0 0', fontSize: 13.5, lineHeight: 1.5,
          color: 'var(--color-text-secondary)', wordBreak: 'break-word', whiteSpace: 'pre-line',
        }}>
          {announcement.body}
        </p>
        <AnnouncementCta announcement={announcement} preview={preview} />
      </div>

      {(onDismiss || preview) && (
        <button
          type="button"
          onClick={preview ? undefined : onDismiss}
          aria-label={t('feed.dismiss')}
          aria-hidden={preview || undefined}
          tabIndex={preview ? -1 : undefined}
          style={{
            position: 'absolute', top: 4, right: 4, width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: preview ? 'default' : 'pointer', color: 'var(--color-text-muted)',
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  )

  if (variant === 'sidebar') {
    return <section aria-label={announcement.title} style={{ flexShrink: 0 }}>{card}</section>
  }
  return (
    <section aria-label={announcement.title} style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
      {card}
    </section>
  )
}
