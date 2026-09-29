// src/app/(main)/explore/people/loading.tsx
//
// Pixel-matched to the real header (56px, 34px back button), category
// chip row ('12px 20px' padding, '7px 16px' pills), and UserCard rows
// (46px avatar, '14px 20px' padding - see user-card.tsx).

export default function WhoToFollowLoading() {
  const chipWidths = [40, 76, 64, 92, 58, 80, 66]

  return (
    <div>
      <style>{`
        @keyframes people-sk-shimmer {
          0%   { opacity: 1;    }
          50%  { opacity: 0.45; }
          100% { opacity: 1;    }
        }
        .people-sk { animation: people-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>

      {/* Sticky header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', height: 56, borderBottom: '1px solid var(--color-border)' }}>
        <div className="people-sk" style={{ width: 34, height: 34, borderRadius: '50%' }} />
        <div className="people-sk" style={{ height: 17, width: 130 }} />
      </div>

      {/* Category chips */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 20px', borderBottom: '1px solid var(--color-border)', overflow: 'hidden' }}>
        {chipWidths.map((w, i) => (
          <div key={i} className="people-sk" style={{ flexShrink: 0, height: 30, width: w, borderRadius: 20 }} />
        ))}
      </div>

      {/* User rows */}
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="people-sk" style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="people-sk" style={{ height: 15, width: 140, marginBottom: 7 }} />
            <div className="people-sk" style={{ height: 12, width: 100, marginBottom: 6 }} />
            <div className="people-sk" style={{ height: 12, width: 170 }} />
          </div>
          <div className="people-sk" style={{ width: 78, height: 34, borderRadius: 24, flexShrink: 0 }} />
        </div>
      ))}
    </div>
  )
}