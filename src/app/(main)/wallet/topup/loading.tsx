// src/app/(main)/wallet/topup/loading.tsx
//
// This route is a client component with no server data fetching, so this
// only covers the brief RSC-shell fetch on first navigation. Pixel-matched
// to the real header (14px/20px, 20px back arrow) and quick-amount chips
// / custom-amount field in topup/page.tsx.

export default function TopUpLoading() {
  return (
    <div>
      <style>{`
        @keyframes topup-sk-shimmer {
          0%   { opacity: 1;    }
          50%  { opacity: 0.45; }
          100% { opacity: 1;    }
        }
        .topup-sk { animation: topup-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <div className="topup-sk" style={{ width: 20, height: 20, borderRadius: 4 }} />
        <div className="topup-sk" style={{ height: 16, width: 130 }} />
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
        <div className="topup-sk" style={{ height: 13, width: '95%', marginBottom: 6 }} />
        <div className="topup-sk" style={{ height: 13, width: '80%', marginBottom: 24 }} />

        {/* Quick amount chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="topup-sk" style={{ flex: '1 0 40%', height: 42, borderRadius: 10 }} />
          ))}
        </div>

        <div className="topup-sk" style={{ height: 11, width: 150, marginBottom: 8 }} />
        <div className="topup-sk" style={{ height: 48, borderRadius: 12, marginBottom: 20 }} />

        <div className="topup-sk" style={{ height: 48, borderRadius: 12 }} />
      </div>
    </div>
  )
}