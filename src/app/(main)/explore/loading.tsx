// src/app/(main)/explore/loading.tsx
// Skeleton that matches the real page layout exactly

export default function ExploreLoading() {
  return (
    <div>
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 1;   }
          50%  { opacity: 0.45; }
          100% { opacity: 1;   }
        }
        .sk { animation: shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>

      {/* Search bar skeleton */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)',
        background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        padding: '12px 20px',
      }}>
        <div className="sk" style={{ height: 44, borderRadius: 24, border: '1.5px solid var(--color-border-light)' }} />
      </div>

      {/* Topic pills */}
      <div style={{ padding: '20px 20px 0' }}>
        <div className="sk" style={{ height: 17, width: 130, marginBottom: 14 }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {[90,80,96,72,100,70,76,88,72,84,70,80].map((w, i) => (
            <div key={i} className="sk" style={{ height: 34, width: w, borderRadius: 100 }} />
          ))}
        </div>
      </div>

      {/* Trending section */}
      <div style={{ borderTop: '1px solid var(--color-border)' }}>
        <div style={{ padding: '16px 20px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="sk" style={{ width: 15, height: 15, borderRadius: '50%' }} />
          <div className="sk" style={{ height: 17, width: 190 }} />
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderBottom: '1px solid var(--color-border)' }}>
            <div className="sk" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="sk" style={{ height: 10, width: 70, marginBottom: 7 }} />
              <div className="sk" style={{ height: 16, width: 130, marginBottom: 6 }} />
              <div className="sk" style={{ height: 10, width: 60 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Suggested people */}
      <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 8 }}>
        <div style={{ padding: '16px 20px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="sk" style={{ width: 15, height: 15, borderRadius: '50%' }} />
          <div className="sk" style={{ height: 17, width: 120 }} />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
            <div className="sk" style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="sk" style={{ height: 16, width: 120, marginBottom: 7 }} />
              <div className="sk" style={{ height: 12, width: 160, marginBottom: 6 }} />
              <div className="sk" style={{ height: 12, width: 200 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}