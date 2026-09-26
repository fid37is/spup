// src/app/not-found.tsx
export default function NotFound() {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)',
      padding: 24, textAlign: 'center',
    }}>
      <div style={{
        fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 88,
        color: 'var(--color-brand)', letterSpacing: '-0.04em', lineHeight: 1,
      }}>
        404
      </div>
      <h1 style={{
        fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 22,
        color: 'var(--color-text-primary)', marginTop: 12,
      }}>
        This page doesn&apos;t exist
      </h1>
      <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginTop: 8, maxWidth: 340 }}>
        The link might be broken, or the page may have been moved or deleted.
      </p>
      {/* Plain <a> — forces a full navigation so the session cookie is re-read */}
      <a
        href="/feed"
        style={{
          marginTop: 24, padding: '11px 24px', borderRadius: 24,
          background: 'var(--color-brand)', color: '#fff', textDecoration: 'none',
          fontWeight: 600, fontSize: 14, fontFamily: "'DM Sans', sans-serif",
          display: 'inline-block',
        }}
      >
        Back to feed
      </a>
    </div>
  )
}