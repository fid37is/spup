// src/app/(main)/messages/page.tsx
//
// Deliberately light: it only checks who is signed in. The conversation list is
// NOT fetched here any more - MessagesListClient paints from the on-device cache
// at once and refreshes in the background, so opening Chat is instant instead of
// waiting on the server every time.

import { redirect } from 'next/navigation'
import { getAuthUser, createAdminClient } from '@/lib/supabase/server'
import PinGate from '@/components/chat/pin-gate'
import MessagesListClient from './messages-list-client'

export default async function MessagesPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) redirect('/login')

  return (
    <PinGate>
      <MessagesListClient currentUserId={profile.id} />
    </PinGate>
  )
}
