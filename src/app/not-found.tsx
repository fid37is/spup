// src/app/not-found.tsx
export default function NotFound() {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', background: '#0A0A0E',
      padding: 24, textAlign: 'center',
    }}>
      <div style={{
        fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 88,
        color: '#1A9E5F', letterSpacing: '-0.04em', lineHeight: 1,
      }}>
        404
      </div>
      <h1 style={{
        fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 22,
        color: '#F0F0EC', marginTop: 12,
      }}>
        This page doesn&apos;t exist
      </h1>
      <p style={{ fontSize: 14, color: '#6A6A60', marginTop: 8, maxWidth: 340 }}>
        The link might be broken, or the page may have been moved or deleted.
      </p>
      {/* Plain <a> — forces a full navigation so the session cookie is re-read */}
      <a
        href="/feed"
        style={{
          marginTop: 24, padding: '11px 24px', borderRadius: 24,
          background: '#1A9E5F', color: '#fff', textDecoration: 'none',
          fontWeight: 600, fontSize: 14, fontFamily: "'DM Sans', sans-serif",
          display: 'inline-block',
        }}
      >
        Back to feed
      </a>
    </div>
  )
}