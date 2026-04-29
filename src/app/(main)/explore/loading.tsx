// src/app/(main)/explore/loading.tsx
// Shows immediately while the page server-renders

export default function ExploreLoading() {
  return (
    <div>
      {/* Search bar skeleton */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)',
        background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        padding: '12px 20px',
      }}>
        <div style={{
          height: 44, borderRadius: 24,
          background: 'var(--color-surface-2)',
          border: '1.5px solid var(--color-border-light)',
        }} />
      </div>

      {/* Topic pills skeleton */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ height: 18, width: 120, borderRadius: 6, background: 'var(--color-surface-3)', marginBottom: 14 }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={{
              height: 36,
              width: [80, 96, 72, 88, 104, 76, 68, 84, 72][i],
              borderRadius: 100,
              background: 'var(--color-surface-3)',
            }} />
          ))}
        </div>
      </div>

      {/* Trending skeleton */}
      <div style={{ borderTop: '1px solid var(--color-border)' }}>
        <div style={{ padding: '16px 20px 10px' }}>
          <div style={{ height: 18, width: 180, borderRadius: 6, background: 'var(--color-surface-3)' }} />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ padding: '13px 20px', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ height: 10, width: 80, borderRadius: 4, background: 'var(--color-surface-3)', marginBottom: 8 }} />
            <div style={{ height: 16, width: 140, borderRadius: 4, background: 'var(--color-surface-3)', marginBottom: 6 }} />
            <div style={{ height: 10, width: 70, borderRadius: 4, background: 'var(--color-surface-3)' }} />
          </div>
        ))}
      </div>

      <style>{`
        @keyframes shimmer {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
        div[style*="surface-3"] { animation: shimmer 1.4s ease-in-out infinite; }
      `}</style>
    </div>
  )
}