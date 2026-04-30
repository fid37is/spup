// src/app/(main)/messages/new/page.tsx

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getFollowing } from '@/lib/queries'
import { getOrCreateConversationAction } from '@/lib/actions/messages'
import NewChatClient from './new-chat-client'
import PinGate from '@/components/chat/pin-gate'

export default async function NewChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) redirect('/login')

  // Show people the viewer follows — most natural list to message
  const following = await getFollowing(profile.id, 100)

  return (
    <PinGate>
      <NewChatClient following={following} />
    </PinGate>
  )
}