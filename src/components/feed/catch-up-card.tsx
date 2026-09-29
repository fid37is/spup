// src/components/feed/catch-up-card.tsx
'use client'

import { Sparkles, X, ArrowDown } from 'lucide-react'
import PostCardWithAnalytics from './post-card-with-analytics'
import type { CatchUp } from '@/lib/actions/feed'
import { useTranslation } from '@/lib/i18n/language-context'

// "While you were away" - the best posts from the window a returning user
// missed, pinned above the normal newest-first stream so they don't have to
// scroll past everything that's happened since to find them.

function awayLabel(iso: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 60) return t('feed.minutes_ago', { count: mins, plural: mins === 1 ? '' : 's' })
  const hours = Math.round(mins / 60)
  if (hours < 24) return t('feed.hours_ago', { count: hours, plural: hours === 1 ? '' : 's' })
  const days = Math.round(hours / 24)
  return t('feed.days_ago', { count: days, plural: days === 1 ? '' : 's' })
}

export default function CatchUpCard({
  catchUp,
  currentUserId,
  onDismiss,
}: {
  catchUp: CatchUp
  currentUserId?: string
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const { since, missedCount, highlights } = catchUp

  return (
    <section
      aria-label={t('feed.catchup_while_away')}
      style={{
        background: 'var(--color-brand-dim)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 16px 10px' }}>
        <Sparkles size={18} color="var(--color-brand)" style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{
            margin: 0, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16,
            color: 'var(--color-text-primary)',
          }}>
            {t('feed.catchup_while_away')}
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
            {t('feed.catchup_summary', { count: missedCount.toLocaleString(), time: awayLabel(since, t) })}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('feed.dismiss')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            color: 'var(--color-text-muted)', display: 'flex',
          }}
        >
          <X size={18} />
        </button>
      </div>

      <div style={{ background: 'var(--color-bg, transparent)' }}>
        {highlights.map(post => (
          <PostCardWithAnalytics key={post.id} post={post} currentUserId={currentUserId} />
        ))}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-brand)', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
        }}
      >
        <ArrowDown size={14} />
        {t('feed.continue_to_latest')}
      </button>
    </section>
  )
}
