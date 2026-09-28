// src/components/feed/catch-up-card.tsx
'use client'

import { Sparkles, X, ArrowDown } from 'lucide-react'
import PostCardWithAnalytics from './post-card-with-analytics'
import type { CatchUp } from '@/lib/actions/feed'

// "While you were away" - the best posts from the window a returning user
// missed, pinned above the normal newest-first stream so they don't have to
// scroll past everything that's happened since to find them.

function awayLabel(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
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
  const { since, missedCount, highlights } = catchUp

  return (
    <section
      aria-label="While you were away"
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
            While you were away
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
            Top posts from the {missedCount.toLocaleString()} you missed since {awayLabel(since)}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
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
        Continue to latest posts
      </button>
    </section>
  )
}
