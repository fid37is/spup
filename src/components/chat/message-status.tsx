// src/components/chat/message-status.tsx
//
// The little indicator next to a message I sent, as in modern chat apps:
//   clock            sending
//   red !            failed (tap to retry)
//   one grey tick    sent       - the server has it
//   two grey ticks   delivered  - the recipient's app has it
//   two green ticks  read       - the recipient has seen it
//
// Inline SVG on purpose: the double tick needs its two strokes offset by a
// precise amount, and it keeps the chat independent of icon-library renames.

import type { MessageStatus } from '@/lib/chat-message-state'

const LABEL: Record<MessageStatus, string> = {
  sending: 'Sending',
  failed: 'Not sent',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
}

export default function MessageStatusIcon({ status, size = 15 }: { status: MessageStatus; size?: number }) {
  const muted = 'var(--color-text-secondary)'
  const common = {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    role: 'img', 'aria-label': LABEL[status], style: { flexShrink: 0, display: 'block' },
  }

  return (
    <span title={LABEL[status]} data-status={status} style={{ display: 'inline-flex', alignItems: 'center' }}>
      {status === 'sending' && (
        <svg {...common} stroke={muted}>
          <circle cx="8" cy="8" r="5.6" />
          <path d="M8 4.9V8l2.1 1.3" />
        </svg>
      )}
      {status === 'failed' && (
        <svg {...common} stroke="var(--color-error)">
          <circle cx="8" cy="8" r="5.8" />
          <path d="M8 4.8v3.6" />
          <circle cx="8" cy="11" r="0.5" fill="var(--color-error)" />
        </svg>
      )}
      {status === 'sent' && (
        <svg {...common} stroke={muted}>
          <path d="M3.6 8.6l2.9 2.9 6-6.4" />
        </svg>
      )}
      {(status === 'delivered' || status === 'read') && (
        <svg {...common} stroke={status === 'read' ? 'var(--color-brand)' : muted}>
          <path d="M1.6 8.7l2.8 2.8 6-6.4" />
          <path d="M7.4 11.2l.3.3 6-6.4" />
        </svg>
      )}
    </span>
  )
}
