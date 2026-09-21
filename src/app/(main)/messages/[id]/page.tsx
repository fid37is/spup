// src/app/(main)/messages/[id]/page.tsx

import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { fetchMessagePage } from '@/lib/chat-queries'
import ChatClient from './chat-client'
import PinGate from '@/components/chat/pin-gate'
import ChatViewport from '@/components/chat/chat-viewport'

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

  // First paint only. This is a pure read now (it no longer marks messages as
  // read - the chat screen does that once they are really on screen), and if it
  // fails the client shows a retry state and re-fetches by itself.
  const page = await fetchMessagePage(supabase, id)

  return (
    <PinGate>
      {/* ChatViewport sits INSIDE the gate so the app's nav only steps aside once
          the chat itself is showing (the PIN screen keeps the normal chrome). */}
      <ChatViewport>
        <ChatClient
          conversationId={id}
          initialMessages={page.messages}
          initialHasMore={page.hasMore}
          initialError={page.error}
          currentUserId={profile.id}
          otherUser={otherUser as any}
        />
      </ChatViewport>
    </PinGate>
  )
}
