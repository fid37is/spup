// src/app/(main)/messages/settings/page.tsx
//
// Chat settings, opened from the chat list's filter menu.

import { redirect } from 'next/navigation'
import { getAuthUser, createAdminClient } from '@/lib/supabase/server'
import ChatSettingsClient from './chat-settings-client'

export default async function ChatSettingsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const { data: profile } = await createAdminClient()
    .from('users').select('username').eq('auth_id', user.id).single()

  return <ChatSettingsClient username={profile?.username ?? ''} />
}