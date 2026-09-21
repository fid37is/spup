// src/app/(main)/notifications/settings/filters/page.tsx

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getNotificationSettingsAction } from '@/lib/actions/notification-settings'
import { SettingsHeader, Intro, ToggleList, type ToggleSection } from '../settings-ui'

export const metadata = {
  title: 'Notification filters - Spup',
  robots: { index: false, follow: false },
}

const SECTIONS: ToggleSection[] = [{
  title: 'Mute notifications from',
  note: 'You won\u2019t be notified about likes, replies, mentions, reposts, quotes or follows from these accounts. Messages, orders, payments and new-post alerts you turned on are never filtered.',
  rows: [
    { key: 'filter_not_following',     label: 'People you don\u2019t follow' },
    { key: 'filter_not_following_you', label: 'People who don\u2019t follow you' },
    { key: 'filter_new_accounts',      label: 'New accounts', desc: 'Accounts created in the last 30 days.' },
    { key: 'filter_default_avatar',    label: 'People with a default profile photo' },
  ],
}]

export default async function NotificationFiltersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const settings = await getNotificationSettingsAction()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <SettingsHeader title="Filters" />
      <Intro>Choose the notifications you&apos;d like to see - and those you don&apos;t.</Intro>
      <ToggleList sections={SECTIONS} initial={settings as unknown as Record<string, boolean>} />
    </div>
  )
}
