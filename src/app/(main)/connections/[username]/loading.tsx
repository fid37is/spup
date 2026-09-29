// src/app/(main)/connections/[username]/loading.tsx
//
// Pixel-matched to the real header (56px, 34px back button) and user rows
// (46px avatar, '14px 20px' padding - see connections-client.tsx) so the
// list doesn't jump when real rows replace it.

export default function ConnectionsLoading() {
  return (
    <div>
      <style>{`
        @keyframes conn-sk-shimmer {
          0%   { opacity: 1;    }
          50%  { opacity: 0.45; }
          100% { opacity: 1;    }
        }
        .conn-sk { animation: conn-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>

      {/* Sticky header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 20px', height: 56,
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div className="conn-sk" style={{ width: 34, height: 34, borderRadius: '50%' }} />
        <div>
          <div className="conn-sk" style={{ height: 15, width: 120, marginBottom: 6 }} />
          <div className="conn-sk" style={{ height: 11, width: 80 }} />
        </div>
      </div>

      {/* Tabs - Following / Followers / Mutuals */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)' }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ flex: 1, padding: '14px 4px', display: 'flex', justifyContent: 'center' }}>
            <div className="conn-sk" style={{ height: 14, width: 64 }} />
          </div>
        ))}
      </div>

      {/* User rows */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="conn-sk" style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="conn-sk" style={{ height: 15, width: 130, marginBottom: 7 }} />
            <div className="conn-sk" style={{ height: 12, width: 90 }} />
          </div>
          <div className="conn-sk" style={{ width: 78, height: 34, borderRadius: 24, flexShrink: 0 }} />
        </div>
      ))}
    </div>
  )
}