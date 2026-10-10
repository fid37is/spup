'use client'

// src/app/(main)/messages/loading.tsx
//
// Shown while the Chat route loads. If this device already knows the chat list
// (from an earlier visit in this session) it is drawn right here with the same
// row component as the real screen - so tapping Chat shows the chats at once and
// the real page then swaps in without any visible change, like WhatsApp.
// Only on the very first visit (nothing cached) does it fall back to skeleton
// rows. Memory only, so it renders identically on server and client.

import { peekChatListMemory } from '@/lib/chat-list-cache'
import ConversationRow from '@/components/chat/conversation-row'
import { ChatListHeader } from './messages-list-client'

export default function MessagesListLoading() {
  const cached = peekChatListMemory()?.filter(c => !c.hidden && !c.lock)

  if (cached && cached.length > 0) {
    return (
      <div>
        <ChatListHeader />
        {cached.map(c => <ConversationRow key={c.id} conv={c} />)}
      </div>
    )
  }

  return (
    <div>
      <style>{`
        @keyframes msgs-sk-shimmer {
          0%   { opacity: 1;    }
          50%  { opacity: 0.45; }
          100% { opacity: 1;    }
        }
        .msgs-sk { animation: msgs-sk-shimmer 1.5s ease-in-out infinite; background: var(--color-surface-3); border-radius: 6px; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <div className="msgs-sk" style={{ height: 20, width: 60 }} />
        <div className="msgs-sk" style={{ width: 98, height: 34, borderRadius: 20 }} />
      </div>

      {/* Conversation rows */}
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="msgs-sk" style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="msgs-sk" style={{ height: 15, width: 140, marginBottom: 8 }} />
            <div className="msgs-sk" style={{ height: 13, width: '70%' }} />
          </div>
          <div className="msgs-sk" style={{ height: 11, width: 34, flexShrink: 0 }} />
        </div>
      ))}
    </div>
  )
}
