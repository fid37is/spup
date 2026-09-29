// src/app/(main)/wallet/loading.tsx
//
// Pixel-matched to the real header ('16px 20px'), balance card (20px
// radius, '24px 20px' padding, 36px balance figure), action-button row,
// and transaction rows (38px icon circle, '14px 0' padding) in
// wallet/page.tsx.

export default function WalletLoading() {
  return (
    <div>
      <style>{`
        @keyframes wallet-sk-shimmer {
          0%   { opacity: 1;    }
          50%  { opacity: 0.45; }
          100% { opacity: 1;    }
        }
        .wallet-sk { animation: wallet-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <div className="wallet-sk" style={{ height: 20, width: 70 }} />
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
        {/* Balance card */}
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 20, padding: '24px 20px', marginBottom: 12 }}>
          <div className="wallet-sk" style={{ height: 11, width: 110, marginBottom: 12 }} />
          <div className="wallet-sk" style={{ height: 34, width: 180, marginBottom: 20 }} />

          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <div className="wallet-sk" style={{ flex: 1, height: 60, borderRadius: 12 }} />
            <div className="wallet-sk" style={{ flex: 1, height: 60, borderRadius: 12 }} />
          </div>

          <div className="wallet-sk" style={{ height: 46, borderRadius: 10, marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="wallet-sk" style={{ width: 90, height: 40, borderRadius: 10 }} />
            <div className="wallet-sk" style={{ width: 90, height: 40, borderRadius: 10 }} />
            <div className="wallet-sk" style={{ width: 78, height: 40, borderRadius: 10 }} />
          </div>
        </div>

        {/* Transactions */}
        <div style={{ marginTop: 24 }}>
          <div className="wallet-sk" style={{ height: 15, width: 110, marginBottom: 8 }} />
          <div className="wallet-sk" style={{ height: 12, width: 130, marginBottom: 16 }} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0' }}>
              <div className="wallet-sk" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="wallet-sk" style={{ height: 14, width: 140, marginBottom: 7 }} />
                <div className="wallet-sk" style={{ height: 11, width: 80 }} />
              </div>
              <div className="wallet-sk" style={{ height: 14, width: 70, flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}