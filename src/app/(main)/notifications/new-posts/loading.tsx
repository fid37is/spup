// src/app/(main)/notifications/new-posts/loading.tsx
//
// Pixel-matched to the real header (53px, 38px back/settings buttons) and
// story-style avatar strip (52px circles, gap 14, '10px 16px 12px' padding
// - see new-posts-client.tsx). Posts below reuse the same PostCard shape
// as feed, so the row skeleton matches feed/loading.tsx's post rows.

export default function NewPostsLoading() {
  return (
    <div>
      <style>{`
        @keyframes newposts-sk-shimmer {
          0%   { opacity: 1;    }
          50%  { opacity: 0.45; }
          100% { opacity: 1;    }
        }
        .newposts-sk { animation: newposts-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>

      <div style={{ borderBottom: '1px solid var(--color-border)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px', height: 53 }}>
          <div className="newposts-sk" style={{ width: 38, height: 38, borderRadius: '50%' }} />
          <div className="newposts-sk" style={{ height: 18, width: 130, flex: 1 }} />
          <div className="newposts-sk" style={{ width: 38, height: 38, borderRadius: '50%' }} />
        </div>

        {/* Story-style avatar strip */}
        <div style={{ display: 'flex', gap: 14, padding: '10px 16px 12px' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 64, flexShrink: 0 }}>
              <div className="newposts-sk" style={{ width: 52, height: 52, borderRadius: '50%' }} />
              <div className="newposts-sk" style={{ height: 10, width: 40 }} />
            </div>
          ))}
        </div>
      </div>

      {/* Posts - same shape as feed */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="newposts-sk" style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="newposts-sk" style={{ height: 14, width: 150, marginBottom: 10 }} />
            <div className="newposts-sk" style={{ height: 13, width: '88%', marginBottom: 7 }} />
            <div className="newposts-sk" style={{ height: 13, width: '60%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}