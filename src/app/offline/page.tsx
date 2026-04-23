'use client'

export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '100dvh', background: '#0A0A0A',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif", padding: 24, textAlign: 'center',
    }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>📡</div>
      <h1 style={{
        fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 28,
        color: '#F5F5F0', letterSpacing: '-0.02em', marginBottom: 12,
      }}>
        You&apos;re offline
      </h1>
      <p style={{ fontSize: 16, color: '#6A6A60', lineHeight: 1.6, maxWidth: 320, marginBottom: 32 }}>
        Check your connection and try again. Your unsent posts will be saved and posted when you&apos;re back online.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: '#1A7A4A', color: 'white', border: 'none',
          borderRadius: 10, padding: '13px 28px',
          fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
          cursor: 'pointer', letterSpacing: '0.01em',
        }}
      >
        Try again
      </button>
    </div>
  )
}
