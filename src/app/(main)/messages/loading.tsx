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
import HideMobileHeader from '@/components/layout/hide-mobile-header'

export default function MessagesListLoading() {
  const cached = peekChatListMemory()?.filter(c => !c.hidden && !c.lock)

  if (cached && cached.length > 0) {
    return (
      <div>
        <HideMobileHeader />
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

      <HideMobileHeader />
      {/* Header: title + (+) row, then the search box - same shape as ChatListHeader */}
      <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 12px) 20px 12px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="msgs-sk" style={{ height: 20, width: 60 }} />
          <div className="msgs-sk" style={{ width: 34, height: 34, borderRadius: '50%' }} />
        </div>
        <div className="msgs-sk" style={{ marginTop: 10, height: 38, borderRadius: 22 }} />
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
