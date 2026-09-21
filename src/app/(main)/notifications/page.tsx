// src/app/(main)/notifications/page.tsx

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getNotificationsAction, getNewPostPaneAction } from '@/lib/actions/notifications'
import NotificationsClient from './notifications-client'

export const metadata = {
  title: 'Notifications - Spup',
  robots: { index: false, follow: false },
}

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Viewer's users.id (realtime subscription) + username (follower-list link)
  const { data: viewer } = await supabase
    .from('users').select('id, username').eq('auth_id', user.id).maybeSingle()

  const [{ notifications, nextCursor }, pane] = await Promise.all([
    getNotificationsAction(undefined, 30, 'all'),
    getNewPostPaneAction(),
  ])

  return (
    <NotificationsClient
      userId={viewer?.id ?? ''}
      username={viewer?.username ?? ''}
      initialItems={notifications}
      initialCursor={nextCursor}
      initialPane={pane}
    />
  )
}
