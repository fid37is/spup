// src/app/(main)/settings/loading.tsx
//
// Pixel-matched to the real header (56px, 34px back button) and
// settings-client.tsx's Row (34x34 icon box, '12px 20px' padding) /
// SectionLabel ('24px 20px 8px' padding) building blocks. Six sections
// mirrors the real page's grouping (Privacy, Notifications, Appearance,
// Account, Security, Danger zone) without needing every row.

export default function SettingsLoading() {
  const sections = [3, 2, 3, 3, 4, 2]

  return (
    <div>
      <style>{`
        @keyframes stg-sk-shimmer {
          0%   { opacity: 1;    }
          50%  { opacity: 0.45; }
          100% { opacity: 1;    }
        }
        .stg-sk { animation: stg-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', height: 56, borderBottom: '1px solid var(--color-border)' }}>
        <div className="stg-sk" style={{ width: 34, height: 34, borderRadius: '50%' }} />
        <div className="stg-sk" style={{ height: 17, width: 90 }} />
      </div>

      {sections.map((rowCount, si) => (
        <div key={si}>
          <div style={{ padding: '24px 20px 8px' }}>
            <div className="stg-sk" style={{ height: 10, width: 90 }} />
          </div>
          {Array.from({ length: rowCount }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--color-border)' }}>
              <div className="stg-sk" style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="stg-sk" style={{ height: 14, width: 140 }} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}