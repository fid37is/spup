'use client'

// src/components/chat/chat-cache-guard.tsx
//
// Mounted once in the (main) layout. Ties the on-device chat-list cache (and the
// "PIN already entered this session" memo) to the signed-in account:
//   - mounting claims the cache for this user, dropping anything cached for
//     someone else on the same phone;
//   - unmounting (the signed-in layout goes away: sign-out, or leaving to a
//     public page) clears the cache, decrypted previews and the PIN memo.
// See lib/chat-list-cache.ts and components/chat/pin-gate.tsx.

import { useEffect } from 'react'
import { claimChatListCache, clearChatListCache } from '@/lib/chat-list-cache'
import { resetPinGateMemo } from '@/components/chat/pin-gate'

export default function ChatCacheGuard({ userId }: { userId: string }) {
  useEffect(() => {
    claimChatListCache(userId)
    return () => {
      clearChatListCache()
      resetPinGateMemo()
    }
  }, [userId])
  return null
}
