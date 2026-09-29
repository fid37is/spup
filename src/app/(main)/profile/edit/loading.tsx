// src/app/(main)/profile/edit/loading.tsx
//
// Pixel-matched to ProfileHeader's edit-mode chrome (120px banner, 36px
// back button, 112px avatar overlapping -56px) and profile-header-edit.tsx's
// labeled fields ('0 16px' padding) and Cancel/Save row at the bottom.

export default function ProfileEditLoading() {
  const fields = [
    { label: 70, height: 44 },   // Display name
    { label: 30, height: 78 },   // Bio (textarea)
    { label: 90, height: 44 },   // Account type
    { label: 65, height: 44 },   // Location
    { label: 100, height: 44 },  // Date of birth
    { label: 110, height: 44 },  // Website / Link
  ]

  return (
    <div>
      <style>{`
        @keyframes profedit-sk-shimmer {
          0%   { opacity: 1;    }
          50%  { opacity: 0.45; }
          100% { opacity: 1;    }
        }
        .profedit-sk { animation: profedit-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>

      {/* Banner + avatar */}
      <div className="profedit-sk" style={{ height: 120, borderRadius: 0, position: 'relative' }}>
        <div className="profedit-sk" style={{ position: 'absolute', top: 12, left: 12, width: 36, height: 36, borderRadius: '50%' }} />
      </div>
      <div style={{ padding: '0 16px' }}>
        <div className="profedit-sk" style={{
          width: 112, height: 112, borderRadius: '50%',
          border: '4px solid var(--color-bg)', marginTop: -56, marginBottom: 20,
        }} />

        {fields.map((f, i) => (
          <div key={i} style={{ marginBottom: 18 }}>
            <div className="profedit-sk" style={{ height: 12, width: f.label, marginBottom: 8 }} />
            <div className="profedit-sk" style={{ height: f.height, borderRadius: 10 }} />
          </div>
        ))}

        {/* Cancel / Save row */}
        <div style={{ display: 'flex', gap: 12, padding: '8px 0 24px' }}>
          <div className="profedit-sk" style={{ flex: 1, height: 44, borderRadius: 22 }} />
          <div className="profedit-sk" style={{ flex: 1, height: 44, borderRadius: 22 }} />
        </div>
      </div>
    </div>
  )
}