// src/app/(main)/messages/[id]/loading.tsx
//
// Shown instantly on opening a conversation - this route re-fetches the
// conversation + message page server-side on every navigation (fully
// dynamic, no cache), so without this file tapping a thread in the list
// did nothing until that finished. Dimensions below are pixel-matched to
// the real header (38px avatar, 12px/16px padding) and message bubbles
// (28px avatar, 9px/13px bubble padding) in chat-client.tsx - it never
// shows any real message content, just shapes, so it's safe to render
// before the PIN gate (if any) has had a chance to run client-side.

export default function ConversationLoading() {
  // true = bubble aligned right (as if "mine"), alternated for a natural look
  const bubbles = [
    { mine: false, width: 160 },
    { mine: true,  width: 120 },
    { mine: false, width: 200 },
    { mine: false, width: 90  },
    { mine: true,  width: 150 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <style>{`
        @keyframes chat-sk-shimmer {
          0%   { opacity: 1;    }
          50%  { opacity: 0.45; }
          100% { opacity: 1;    }
        }
        .chat-sk { animation: chat-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>

      {/* Header */}
      <div style={{
        flexShrink: 0, backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        padding: '12px 16px', paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div className="chat-sk" style={{ width: 20, height: 20, borderRadius: 4 }} />
        <div className="chat-sk" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }} />
        <div>
          <div className="chat-sk" style={{ height: 15, width: 120, marginBottom: 6 }} />
          <div className="chat-sk" style={{ height: 11, width: 70 }} />
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, minHeight: 0, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bubbles.map((b, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: b.mine ? 'flex-end' : 'flex-start' }}>
            <div className="chat-sk" style={{ height: 34, width: b.width, borderRadius: 16 }} />
          </div>
        ))}
      </div>

      {/* Composer */}
      <div style={{
        flexShrink: 0, borderTop: '1px solid var(--color-border)',
        padding: '10px 16px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div className="chat-sk" style={{ flex: 1, height: 38, borderRadius: 20 }} />
        <div className="chat-sk" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }} />
      </div>
    </div>
  )
}