'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Main segment error:', error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '60dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--color-surface-3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
          color: 'var(--color-text-muted)',
        }}
        aria-hidden
      >
        <AlertTriangle size={28} strokeWidth={2} />
      </div>

      <h1
        style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 700,
          fontSize: 22,
          color: 'var(--color-text-primary)',
          margin: 0,
        }}
      >
        Something went wrong
      </h1>

      <p
        style={{
          fontSize: 14,
          color: 'var(--color-text-muted)',
          marginTop: 8,
          maxWidth: 340,
          lineHeight: 1.5,
        }}
      >
        This page couldn&apos;t load. You can try again, or go back to the feed.
      </p>

      <div
        style={{
          display: 'flex',
          gap: 12,
          marginTop: 24,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '11px 24px',
            borderRadius: 24,
            border: 'none',
            background: 'var(--color-brand)',
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
            fontFamily: "'DM Sans', sans-serif",
            cursor: 'pointer',
          }}
        >
          Try again
        </button>

        <a
          href="/feed"
          style={{
            padding: '11px 24px',
            borderRadius: 24,
            background: 'var(--color-surface-3)',
            color: 'var(--color-text-primary)',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
            fontFamily: "'DM Sans', sans-serif",
            display: 'inline-block',
          }}
        >
          Back to feed
        </a>
      </div>
    </div>
  )
}