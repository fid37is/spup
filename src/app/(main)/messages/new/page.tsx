// src/app/(main)/messages/new/page.tsx

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getMutuals } from '@/lib/mutuals'
import NewChatClient from './new-chat-client'
import PinGate from '@/components/chat/pin-gate'

export default async function NewChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) redirect('/login')

  // Chat is mutual-only, so the picker lists only people who follow each other
  const following = await getMutuals(profile.id, 100)

  return (
    <PinGate>
      <NewChatClient following={following} />
    </PinGate>
  )
}