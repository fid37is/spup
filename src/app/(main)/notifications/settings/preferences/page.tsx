// src/app/(main)/notifications/settings/preferences/page.tsx

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getNotificationSettingsAction } from '@/lib/actions/notification-settings'
import { SettingsHeader, Intro, ToggleList, type ToggleSection } from '../settings-ui'

export const metadata = {
  title: 'Notification preferences - Spup',
  robots: { index: false, follow: false },
}

const SECTIONS: ToggleSection[] = [
  {
    title: 'Where you get notified',
    rows: [
      { key: 'notif_push',  label: 'Push notifications', desc: 'On your phone or browser, even when Spup is closed.' },
      { key: 'notif_email', label: 'Email notifications', desc: 'Mentions and important alerts, sent to your email.' },
    ],
  },
  {
    title: 'What you get notified about',
    note: 'Turn a type off and it won\u2019t appear in your notifications or send a push.',
    rows: [
      { key: 'pref_replies',  label: 'Replies',            desc: 'Someone replies to your post or reply.' },
      { key: 'pref_mentions', label: 'Mentions',           desc: 'Someone @mentions you in a post.' },
      { key: 'pref_likes',    label: 'Likes',              desc: 'Someone likes your post or reply.' },
      { key: 'pref_reposts',  label: 'Reposts and quotes', desc: 'Someone reposts or quotes your post.' },
      { key: 'pref_follows',  label: 'New followers' },
      { key: 'pref_messages', label: 'Direct messages' },
      { key: 'pref_posts',    label: 'New posts',          desc: 'Posts from people you turned on post notifications for.' },
      { key: 'pref_wallet',   label: 'Wallet and orders',  desc: 'Tips, earnings, escrow and order updates.' },
    ],
  },
]

export default async function NotificationPreferencesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [settings, { data: me }] = await Promise.all([
    getNotificationSettingsAction(),
    supabase.from('users').select('notif_push, notif_email').eq('auth_id', user.id).maybeSingle(),
  ])

  const initial: Record<string, boolean> = {
    ...(settings as unknown as Record<string, boolean>),
    notif_push:  me?.notif_push  ?? true,
    notif_email: me?.notif_email ?? true,
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <SettingsHeader title="Preferences" />
      <Intro>Select your preferences by notification type.</Intro>
      <ToggleList sections={SECTIONS} initial={initial} />
    </div>
  )
}
