// src/app/(main)/settings/two-factor/loading.tsx
//
// This route is a client component (two-factor/page.tsx checks MFA status
// via a client-side effect and manages its own `pageLoading` spinner once
// mounted), so this only covers the brief RSC-shell fetch on first
// navigation - the header below is pixel-matched (56px, 34px back button)
// so there's no jump once the real page takes over.

export default function TwoFactorLoading() {
  return (
    <div>
      <style>{`
        @keyframes tfa-sk-shimmer {
          0%   { opacity: 1;    }
          50%  { opacity: 0.45; }
          100% { opacity: 1;    }
        }
        .tfa-sk { animation: tfa-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', height: 56, borderBottom: '1px solid var(--color-border)' }}>
        <div className="tfa-sk" style={{ width: 34, height: 34, borderRadius: '50%' }} />
        <div className="tfa-sk" style={{ height: 17, width: 160 }} />
      </div>
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div className="tfa-sk" style={{ width: 52, height: 52, borderRadius: '50%', margin: '0 auto 16px' }} />
        <div className="tfa-sk" style={{ height: 14, width: '70%', margin: '0 auto 8px' }} />
        <div className="tfa-sk" style={{ height: 14, width: '50%', margin: '0 auto 24px' }} />
        <div className="tfa-sk" style={{ height: 44, width: 200, borderRadius: 22, margin: '0 auto' }} />
      </div>
    </div>
  )
}