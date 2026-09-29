// src/app/(main)/wallet/orders/loading.tsx
//
// Pixel-matched to the real header ('16px 20px'), Buying/Selling tabs
// ('10px 16px' padding), and order rows (38px icon circle, '14px 16px'
// padding, 14px radius - see orders/page.tsx).

export default function OrdersLoading() {
  return (
    <div>
      <style>{`
        @keyframes orders-sk-shimmer {
          0%   { opacity: 1;    }
          50%  { opacity: 0.45; }
          100% { opacity: 1;    }
        }
        .orders-sk { animation: orders-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>

      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <div className="orders-sk" style={{ height: 20, width: 70, marginBottom: 8 }} />
        <div className="orders-sk" style={{ height: 12, width: 220 }} />
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
        {/* Buying / Selling tabs */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 24, borderBottom: '1px solid var(--color-border)', paddingBottom: 10 }}>
          <div className="orders-sk" style={{ height: 14, width: 54 }} />
          <div className="orders-sk" style={{ height: 14, width: 54 }} />
        </div>

        {/* Order rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: '1px solid var(--color-border)', borderRadius: 14 }}>
              <div className="orders-sk" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="orders-sk" style={{ height: 14, width: 110, marginBottom: 6 }} />
                <div className="orders-sk" style={{ height: 12, width: 130 }} />
              </div>
              <div className="orders-sk" style={{ height: 15, width: 70, flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}