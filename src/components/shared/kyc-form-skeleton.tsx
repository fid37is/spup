'use client'

// src/components/shared/kyc-form-skeleton.tsx
//
// verify-bvn/page.tsx and verify-nin/page.tsx are both client components
// built from the identical template: maxWidth 480, a back link, a 44px
// icon box (radius 12), title + description, one input, one button. This
// shape lives here once instead of being duplicated in both loading.tsx.

export function KycFormLoading() {
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '28px 20px' }}>
      <style>{`
        @keyframes kyc-sk-shimmer {
          0%   { opacity: 1;    }
          50%  { opacity: 0.45; }
          100% { opacity: 1;    }
        }
        .kyc-sk { animation: kyc-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>

      <div className="kyc-sk" style={{ height: 14, width: 110, marginBottom: 28 }} />

      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        <div className="kyc-sk" style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="kyc-sk" style={{ height: 18, width: 170, marginBottom: 8 }} />
          <div className="kyc-sk" style={{ height: 13, width: '95%', marginBottom: 5 }} />
          <div className="kyc-sk" style={{ height: 13, width: '80%' }} />
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div className="kyc-sk" style={{ height: 12, width: 60, marginBottom: 8 }} />
        <div className="kyc-sk" style={{ height: 44, borderRadius: 10 }} />
      </div>

      <div className="kyc-sk" style={{ height: 46, borderRadius: 10 }} />
    </div>
  )
}