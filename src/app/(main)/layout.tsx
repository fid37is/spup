import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfileByAuthId, getOnboardingProgress, getUnreadNotificationCount } from '@/lib/queries'
import { getWallet } from '@/lib/queries'
import SidebarNav from '@/components/layout/sidebar-nav'
import RightSidebar from '@/components/layout/right-sidebar'
import MobileBottomNav from '@/components/layout/mobile-bottom-nav'

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
    <>
      <style>{`
        /* Desktop: sidebar layout */
        .main-layout {
          display: flex;
          min-height: 100dvh;
          max-width: 1300px;
          margin: 0 auto;
          font-family: 'DM Sans', sans-serif;
        }
        .sidebar-left  { display: flex; }
        .sidebar-right { display: flex; }
        .main-content  { flex: 1; border-right: 1px solid var(--color-border); min-height: 100dvh; min-width: 0; }
        .mobile-nav    { display: none; }

        /* Mobile: hide sidebars, show bottom nav */
        @media (max-width: 767px) {
          .main-layout   { max-width: 100%; }
          .sidebar-left  { display: none; }
          .sidebar-right { display: none; }
          .main-content  { border-right: none; padding-bottom: calc(64px + env(safe-area-inset-bottom)); }
          .mobile-nav    { display: flex; }
        }
        /* Tablet: left sidebar only */
        @media (min-width: 768px) and (max-width: 1023px) {
          .sidebar-right { display: none; }
          .main-content  { border-right: none; }
        }
      `}</style>

      <div className="main-layout">
        <div className="sidebar-left">
          <SidebarNav profile={profile} unreadCount={unreadCount} />
        </div>

        <main className="main-content">
          {children}
        </main>

        <div className="sidebar-right">
          <RightSidebar profile={profile} walletBalance={wallet?.balance_kobo || 0} />
        </div>
      </div>

      {/* Mobile bottom nav — fixed, outside layout flow */}
      <div className="mobile-nav">
        <MobileBottomNav unreadCount={unreadCount} />
      </div>
    </>
  )
}