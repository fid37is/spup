import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getProfileByAuthId } from '@/lib/queries'
import { getNotifications } from '@/lib/queries'
import NotificationsList from './notifications-list'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfileByAuthId(user.id)
  if (!profile) redirect('/login')

  const { notifications, nextCursor } = await getNotifications(profile.id, 30)

  return (
    <div>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(20px)', background: 'rgba(10,10,10,0.9)', borderBottom: '1px solid #1A1A1A', padding: '16px 20px' }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: '#F5F5F0' }}>Notifications</h1>
      </div>
      <NotificationsList initialNotifications={notifications} initialCursor={nextCursor} userId={profile.id} />
    </div>
  )
}