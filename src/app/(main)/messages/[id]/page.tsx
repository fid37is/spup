// src/app/(main)/messages/[id]/page.tsx

import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ChatClient from './chat-client'
import PinGate from '@/components/chat/pin-gate'
import ChatViewport from '@/components/chat/chat-viewport'
import { getChatLockReason } from '@/lib/mutuals'

// The other person's account may have been deleted; the thread should still open.
const DELETED_USER = {
  id: '', username: 'deleted', display_name: 'Deleted account', avatar_url: null, verification_tier: 'none',
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get viewer profile
  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) redirect('/login')

  // Verify this conversation belongs to the viewer
  const { data: conv } = await supabase
    .from('conversations')
    .select(`
      id, participant_1, participant_2,
      p1:users!conversations_participant_1_fkey(id, username, display_name, avatar_url, verification_tier),
      p2:users!conversations_participant_2_fkey(id, username, display_name, avatar_url, verification_tier)
    `)
    .eq('id', id)
    .or(`participant_1.eq.${profile.id},participant_2.eq.${profile.id}`)
    .single()

  if (!conv) notFound()

  const otherUser = (conv.participant_1 === profile.id ? conv.p2 : conv.p1) ?? DELETED_USER

  // The messages are NOT fetched here any more. This used to run a query for the latest page on
  // every single visit, which both delayed opening the thread and re-sent messages the phone
  // already had. The chat screen paints from its on-device copy (lib/chat-thread-cache.ts) and
  // catches up in the background; the very first visit to a thread loads its page once.
  const otherId = (otherUser as any).id as string
  const lock = otherId ? await getChatLockReason(profile.id, otherId) : null

  return (
    <PinGate>
      {/* ChatViewport sits INSIDE the gate so the app's nav only steps aside once
          the chat itself is showing (the PIN screen keeps the normal chrome). */}
      <ChatViewport>
        <ChatClient
          conversationId={id}
          currentUserId={profile.id}
          otherUser={otherUser as any}
          initialLock={lock}
        />
      </ChatViewport>
    </PinGate>
  )
}