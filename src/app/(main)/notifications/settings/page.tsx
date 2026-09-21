// src/app/(main)/notifications/settings/page.tsx
//
// Notification settings hub - mirrors X's "Notifications" settings screen:
// a short blurb, then Filters and Preferences.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SlidersHorizontal, Settings, Bell } from 'lucide-react'
import { SettingsHeader, Intro, MenuRow } from './settings-ui'

export const metadata = {
  title: 'Notification settings - Spup',
  robots: { index: false, follow: false },
}

export default async function NotificationSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('users').select('username').eq('auth_id', user.id).maybeSingle()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <SettingsHeader
        title="Notifications"
        subtitle={me?.username ? `@${me.username}` : undefined}
        backHref="/notifications"
      />
      <Intro>Select the kinds of notifications you get about your activities, interests, and recommendations.</Intro>

      <MenuRow
        href="/notifications/settings/filters"
        icon={<SlidersHorizontal size={24} />}
        title="Filters"
        desc="Choose the notifications you'd like to see - and those you don't."
      />
      <MenuRow
        href="/notifications/settings/preferences"
        icon={<Settings size={24} />}
        title="Preferences"
        desc="Select your preferences by notification type."
      />
      <MenuRow
        href="/notifications/settings/post-notifications"
        icon={<Bell size={24} />}
        title="Post notifications"
        desc="Manage the people you get notified about when they post."
      />
    </div>
  )
}
