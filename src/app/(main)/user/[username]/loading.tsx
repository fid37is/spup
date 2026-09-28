// src/app/(main)/user/[username]/loading.tsx
//
// Shown instantly on navigation to a profile - this route is fully dynamic
// (no cache), so without this file the click sat frozen until every query
// in page.tsx (profile, follow state, mutuals, posts) finished. Dimensions
// below are pixel-matched to the real ProfileHeader (120px banner, 112px
// avatar overlapping by -56px) and ProfileTabs (13px 4px tab padding), so
// nothing jumps when the real content replaces it.

export default function ProfileLoading() {
  return (
    <div>
      <style>{`
        @keyframes profile-sk-shimmer {
          0%   { opacity: 1;    }
          50%  { opacity: 0.45; }
          100% { opacity: 1;    }
        }
        .profile-sk { animation: profile-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>

      {/* Banner */}
      <div className="profile-sk" style={{ height: 120, borderRadius: 0 }} />

      <div style={{ padding: '0 16px' }}>
        {/* Avatar, overlapping the banner the same way the real one does */}
        <div className="profile-sk" style={{
          width: 112, height: 112, borderRadius: '50%',
          border: '4px solid var(--color-bg)', marginTop: -56, marginBottom: 12,
        }} />

        {/* Name + username */}
        <div className="profile-sk" style={{ height: 20, width: 170, marginBottom: 8 }} />
        <div className="profile-sk" style={{ height: 14, width: 110, marginBottom: 12 }} />

        {/* Bio */}
        <div className="profile-sk" style={{ height: 14, width: '85%', marginBottom: 7 }} />
        <div className="profile-sk" style={{ height: 14, width: '55%', marginBottom: 14 }} />

        {/* Stats row - Following / Followers / Mutuals */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 4 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="profile-sk" style={{ height: 14, width: 74 }} />
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)', marginTop: 16,
      }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ flex: '1 1 0', padding: '13px 4px', display: 'flex', justifyContent: 'center' }}>
            <div className="profile-sk" style={{ height: 14, width: 50 }} />
          </div>
        ))}
      </div>

      {/* Posts */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="profile-sk" style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="profile-sk" style={{ height: 14, width: 150, marginBottom: 10 }} />
            <div className="profile-sk" style={{ height: 13, width: '90%', marginBottom: 7 }} />
            <div className="profile-sk" style={{ height: 13, width: '65%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}