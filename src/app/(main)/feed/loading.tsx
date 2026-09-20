// src/app/(main)/feed/loading.tsx
//
// Shown instantly while the feed's posts load. Without this file the whole
// page (nav included) waited for the server-side feed query before anything
// was sent to the phone - on a slow connection that is the long blank/splash
// screen. With it, the app shell appears straight away and posts stream in.

export default function FeedLoading() {
  return (
    <div>
      <style>{`
        @keyframes feed-shimmer {
          0%   { opacity: 1;    }
          50%  { opacity: 0.45; }
          100% { opacity: 1;    }
        }
        .feed-sk { animation: feed-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>

      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          style={{ display: 'flex', gap: 12, padding: '16px', borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="feed-sk" style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="feed-sk" style={{ height: 14, width: 150, marginBottom: 10 }} />
            <div className="feed-sk" style={{ height: 13, width: '92%', marginBottom: 7 }} />
            <div className="feed-sk" style={{ height: 13, width: '70%', marginBottom: i % 2 === 0 ? 12 : 0 }} />
            {i % 2 === 0 && <div className="feed-sk" style={{ height: 180, width: '100%', borderRadius: 14 }} />}
          </div>
        </div>
      ))}
    </div>
  )
}
