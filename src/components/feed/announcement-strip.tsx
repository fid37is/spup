'use client'

// src/components/feed/announcement-strip.tsx
//
// The pinned version for urgent maintenance notices on phones: one slim line that
// stays under the feed tabs while you scroll, so it can't be missed, without
// covering any posts. Tap the line to read the full message and the button; X
// dismisses it (it comes back after the reminder interval if the admin set one).

import { useState } from 'react'
import { Wrench, X, ChevronDown } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/language-context'
import { AnnouncementCta, KIND_STYLE, type AnnouncementCardData } from './announcement-banner'

export default function AnnouncementStrip({
  announcement,
  preview = false,
  onDismiss,
}: {
  announcement: AnnouncementCardData
  preview?: boolean
  onDismiss?: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const style = KIND_STYLE[announcement.kind]

  return (
    <section
      aria-label={announcement.title}
      style={{ background: style.tint, borderTop: `1px solid ${style.border}` }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          style={{
            flex: 1, minWidth: 0, height: 40, display: 'flex', alignItems: 'center', gap: 8,
            padding: '0 4px 0 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
            color: 'var(--color-text-primary)',
          }}
        >
          <Wrench size={15} aria-hidden="true" style={{ flexShrink: 0, color: style.accent }} />
          <span style={{
            flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13,
          }}>
            {announcement.title}
          </span>
          <ChevronDown
            size={16} aria-hidden="true"
            style={{ flexShrink: 0, color: 'var(--color-text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
          />
        </button>
        {(onDismiss || preview) && (
          <button
            type="button"
            onClick={preview ? undefined : onDismiss}
            aria-label={t('feed.dismiss')}
            aria-hidden={preview || undefined}
            tabIndex={preview ? -1 : undefined}
            style={{
              width: 40, height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: preview ? 'default' : 'pointer', color: 'var(--color-text-muted)',
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {open && (
        <div style={{ padding: '0 16px 12px 39px' }}>
          <p style={{
            margin: 0, fontSize: 13.5, lineHeight: 1.5,
            color: 'var(--color-text-secondary)', wordBreak: 'break-word', whiteSpace: 'pre-line',
          }}>
            {announcement.body}
          </p>
          <AnnouncementCta announcement={announcement} preview={preview} />
        </div>
      )}
    </section>
  )
}
