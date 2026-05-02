// src/app/(main)/messages/[id]/page.tsx

import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getMessagesAction } from '@/lib/actions/messages'
import ChatClient from './chat-client'
import PinGate from '@/components/chat/pin-gate'

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

  const otherUser = conv.participant_1 === profile.id ? conv.p2 : conv.p1
  const messages = await getMessagesAction(id)

  return (
    <PinGate>
      <ChatClient
        conversationId={id}
        initialMessages={messages as any}
        currentUserId={profile.id}
        otherUser={otherUser as any}
      />
    </PinGate>
  )
}