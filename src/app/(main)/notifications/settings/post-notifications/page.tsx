// src/app/(main)/notifications/settings/post-notifications/page.tsx

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPostNotificationTargetsAction } from '@/lib/actions/notification-settings'
import { SettingsHeader, Intro, PostNotificationList } from '../settings-ui'

export const metadata = {
  title: 'Post notifications - Spup',
  robots: { index: false, follow: false },
}

export default async function PostNotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const people = await getPostNotificationTargetsAction()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <SettingsHeader title="Post notifications" />
      <Intro>
        You&apos;re notified when these people post, and everything they do around you shows up under
        Priority on your notifications page.
      </Intro>
      <PostNotificationList initial={people} />
    </div>
  )
}
