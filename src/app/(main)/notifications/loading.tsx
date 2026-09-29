// src/app/(main)/notifications/loading.tsx
//
// Pixel-matched to the real header (53px title row, 40px icon buttons,
// 52px tabs) and to the row skeleton the client component already uses
// for in-app tab switches (see the `loading && !current.loaded` block in
// notifications-client.tsx) - reusing that exact shape here too.

export default function NotificationsLoading() {
  return (
    <div>
      <style>{`
        @keyframes notif-sk-shimmer {
          0%   { opacity: 1;    }
          50%  { opacity: 0.45; }
          100% { opacity: 1;    }
        }
        .notif-sk { animation: notif-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', height: 53, position: 'relative' }}>
          <div className="notif-sk" style={{ height: 20, width: 140 }} />
          <div style={{ display: 'flex', gap: 2, position: 'absolute', right: 8 }}>
            <div className="notif-sk" style={{ width: 40, height: 40, borderRadius: '50%' }} />
          </div>
        </div>
        <div style={{ display: 'flex' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="notif-sk" style={{ height: 14, width: 60 }} />
            </div>
          ))}
        </div>
      </div>

      {/* Rows - same shape as the client's own tab-switch skeleton */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="notif-sk" style={{ width: 40, height: 26, borderRadius: 8 }} />
          <div style={{ flex: 1 }}>
            <div className="notif-sk" style={{ width: 32, height: 32, borderRadius: '50%', marginBottom: 10 }} />
            <div className="notif-sk" style={{ height: 13, width: '70%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}