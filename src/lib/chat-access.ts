// src/lib/chat-access.ts
//
// Client-safe (no server imports). Why a conversation can't be written to.
//
// Only two reasons are ever exposed to a browser. If the OTHER person blocked
// you, you get 'not_mutual' - the same thing you'd see if they had simply
// unfollowed - so a block can't be detected by comparing messages or reading
// network responses.

export type ChatLockReason = 'blocked_by_me' | 'not_mutual'

export const CHAT_LOCK_COPY: Record<ChatLockReason, string> = {
  blocked_by_me: 'You blocked this account. Unblock them to message again.',
  not_mutual: "You can't reply to this conversation. You can only message people who follow you back.",
}
