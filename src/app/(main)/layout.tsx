import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getProfileByAuthId, getOnboardingProgress, getUnreadNotificationCount } from '@/lib/queries'
import { getWallet } from '@/lib/queries'
import SidebarNav from '@/components/layout/sidebar-nav'
import RightSidebar from '@/components/layout/right-sidebar'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfileByAuthId(user.id)
  if (!profile) redirect('/login')
  if (profile.status === 'banned') redirect('/banned')

  const onboarding = await getOnboardingProgress(profile.id)
  if (!onboarding?.completed_at) redirect('/onboarding')

  const [unreadCount, wallet] = await Promise.all([
    getUnreadNotificationCount(profile.id),
    getWallet(profile.id),
  ])

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', maxWidth: 1300, margin: '0 auto', fontFamily: "'DM Sans', sans-serif" }}>
      <SidebarNav profile={profile} unreadCount={unreadCount} />
      <main style={{ flex: 1, borderRight: '1px solid #1A1A1A', minHeight: '100dvh', minWidth: 0 }}>
        {children}
      </main>
      <RightSidebar profile={profile} walletBalance={wallet?.balance_kobo || 0} />
    </div>
  )
}
