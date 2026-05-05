// src/app/(main)/notifications/page.tsx

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getNotificationsAction } from '@/lib/actions/notifications'
import NotificationsList from './notifications-list'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch viewer's users.id for realtime subscription
  const { data: viewer } = await supabase
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()

  const { notifications, nextCursor } = await getNotificationsAction()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        padding: '14px 20px',
      }}>
        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800,
          fontSize: 20, color: 'var(--color-text-primary)', margin: 0,
        }}>
          Notifications
        </h1>
      </div>

      <NotificationsList
        initialNotifications={notifications}
        initialCursor={nextCursor}
        userId={viewer?.id ?? ''}
      />
    </div>
  )
}