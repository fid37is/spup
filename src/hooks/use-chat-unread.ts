'use client'

// src/hooks/use-chat-unread.ts
//
// Live unread-message count for the Chat tab badge (mobile bottom nav + desktop
// sidebar). The layout gives the server-rendered count as the starting value;
// after that it stays right without a page reload:
//
//   - a message arrives (realtime INSERT, RLS-scoped to my conversations)
//       -> +1 straight away, then re-checked with the server once the
//          unread-counter bookkeeping in sendMessageAction has had time to land
//   - I read a conversation, or the list refreshes  -> notifyChatUnreadChanged()
//   - I navigate to another screen                  -> re-check
//   - tab wakes up / network returns                -> re-check
//   - slow poll                                     -> catches reads done on another device
//
// The realtime channel shares the browser's single Supabase socket (the browser
// client is a singleton), so this adds a channel, not a connection.

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { getUnreadChatCountAction } from '@/lib/actions/messages'

export const CHAT_UNREAD_EVENT = 'spup:chat-unread-changed'

/** Call after anything that changes what's unread (marked read, list refreshed). */
export function notifyChatUnreadChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHAT_UNREAD_EVENT))
}

const SETTLE_MS = 1500      // after a live message: let the server-side counter update land first
const QUICK_MS = 300        // after everything else
const POLL_MS = 45_000

export function useChatUnread(initial: number, myUserId: string): number {
  const pathname = usePathname()
  const [count, setCount] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busy = useRef(false)
  const firstRoute = useRef(true)

  const refresh = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const n = await getUnreadChatCountAction()
      if (typeof n === 'number') setCount(n)
    } catch {
      /* offline / transient - the next trigger will catch up */
    } finally {
      busy.current = false
    }
  }, [])

  const schedule = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void refresh() }, ms)
  }, [refresh])

  // Moving between screens (e.g. leaving a chat that just cleared its unread).
  useEffect(() => {
    if (firstRoute.current) { firstRoute.current = false; return } // the server value is fresh on first paint
    schedule(QUICK_MS)
  }, [pathname, schedule])

  useEffect(() => {
    const sb = createBrowserClient()
    const channel = sb
      .channel(`chat-unread:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload: any) => {
        if (payload?.new?.sender_id === myUserId) return       // my own send isn't unread
        setCount(c => c + 1)                                    // instant...
        schedule(SETTLE_MS)                                     // ...then the authoritative number
      })
      .subscribe()

    const onChanged = () => schedule(QUICK_MS)
    const wake = () => { if (document.visibilityState === 'visible') schedule(QUICK_MS) }
    const poll = setInterval(wake, POLL_MS)
    window.addEventListener(CHAT_UNREAD_EVENT, onChanged)
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)

    return () => {
      if (timer.current) clearTimeout(timer.current)
      clearInterval(poll)
      window.removeEventListener(CHAT_UNREAD_EVENT, onChanged)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      void sb.removeChannel(channel)
    }
  }, [myUserId, schedule])

  return count
}
