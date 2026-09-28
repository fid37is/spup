// src/app/(main)/post/[id]/loading.tsx
//
// Shown instantly on navigation to a post - this route has no cached data
// (auth-gated, dynamic) so without this file the click did nothing until
// the full reply-tree query finished server-side, then the whole page
// snapped in at once. Dimensions below are pixel-matched to the real
// header + PostCard (42px avatar, 16-20px padding - see post-card.tsx and
// nested-replies.tsx) so nothing jumps when the real content replaces it.

export default function PostDetailLoading() {
  return (
    <div style={{ paddingBottom: 80 }}>
      <style>{`
        @keyframes post-sk-shimmer {
          0%   { opacity: 1;    }
          50%  { opacity: 0.45; }
          100% { opacity: 1;    }
        }
        .post-sk { animation: post-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>

      {/* Header - back arrow + "Post" title, sticky */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px',
      }}>
        <div className="post-sk" style={{ width: 20, height: 20, borderRadius: 4 }} />
        <div className="post-sk" style={{ width: 46, height: 18 }} />
      </div>

      {/* Main post */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div className="post-sk" style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0 }} />
          <div>
            <div className="post-sk" style={{ height: 15, width: 150, marginBottom: 7 }} />
            <div className="post-sk" style={{ height: 12, width: 100 }} />
          </div>
        </div>
        <div className="post-sk" style={{ height: 15, width: '95%', marginBottom: 8 }} />
        <div className="post-sk" style={{ height: 15, width: '80%', marginBottom: 8 }} />
        <div className="post-sk" style={{ height: 15, width: '55%', marginBottom: 16 }} />
        <div className="post-sk" style={{ height: 12, width: 90, marginBottom: 18 }} />
        {/* Action row - reply, repost, like, impressions */}
        <div style={{ display: 'flex', gap: 32 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="post-sk" style={{ height: 18, width: 34 }} />
          ))}
        </div>
      </div>

      {/* Sort + activity row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <div className="post-sk" style={{ height: 14, width: 80 }} />
        <div className="post-sk" style={{ height: 14, width: 90 }} />
      </div>

      {/* Reply composer */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
        <div className="post-sk" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }} />
        <div className="post-sk" style={{ flex: 1, height: 36, borderRadius: 8 }} />
      </div>

      {/* Replies */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="post-sk" style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="post-sk" style={{ height: 14, width: 130, marginBottom: 10 }} />
            <div className="post-sk" style={{ height: 13, width: '88%', marginBottom: 7 }} />
            <div className="post-sk" style={{ height: 13, width: '60%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}