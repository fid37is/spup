// src/app/(main)/messages/new/loading.tsx
//
// Pixel-matched to the real header ('14px 20px'), search bar ('12px 16px'
// wrapper around a '10px 16px 10px 40px' input), and the following-list
// rows (46px avatar, '14px 20px' padding - see new-chat-client.tsx).

export default function NewChatLoading() {
  return (
    <div>
      <style>{`
        @keyframes newchat-sk-shimmer {
          0%   { opacity: 1;    }
          50%  { opacity: 0.45; }
          100% { opacity: 1;    }
        }
        .newchat-sk { animation: newchat-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <div className="newchat-sk" style={{ width: 34, height: 34, borderRadius: '50%' }} />
        <div className="newchat-sk" style={{ height: 17, width: 110 }} />
      </div>

      {/* Search bar */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
        <div className="newchat-sk" style={{ height: 44, borderRadius: 22 }} />
      </div>

      {/* Following rows */}
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="newchat-sk" style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="newchat-sk" style={{ height: 15, width: 140, marginBottom: 7 }} />
            <div className="newchat-sk" style={{ height: 12, width: 100 }} />
          </div>
        </div>
      ))}
    </div>
  )
}