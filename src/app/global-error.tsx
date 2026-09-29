'use client'

import { useEffect } from 'react'

function AlertTriangleIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'DM Sans', system-ui, sans-serif",
          background: '#0a0a0a',
          color: '#f5f5f5',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: '#222',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            color: '#a3a3a3',
          }}
        >
          <AlertTriangleIcon size={28} />
        </div>

        <h1 style={{ fontFamily: 'system-ui', fontWeight: 700, fontSize: 22, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 14, opacity: 0.7, marginTop: 8, maxWidth: 340, lineHeight: 1.5 }}>
          Spup hit an unexpected error. Try again, or return home.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '11px 24px',
              borderRadius: 24,
              border: 'none',
              background: '#1A7A4A',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              padding: '11px 24px',
              borderRadius: 24,
              background: '#222',
              color: '#f5f5f5',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Go home
          </a>
        </div>
      </body>
    </html>
  )
}