import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfileByAuthId, getOnboardingProgress, getUnreadNotificationCount } from '@/lib/queries'
import { getWallet } from '@/lib/queries'
import SidebarNav from '@/components/layout/sidebar-nav'
import RightSidebar from '@/components/layout/right-sidebar'
import MobileBottomNav from '@/components/layout/mobile-bottom-nav'
import MobileHeader from '@/components/layout/mobile-header'
import { AppThemeProvider } from '@/components/layout/theme-provider'

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
    <AppThemeProvider>
      <style>{`
        .main-layout {
          display: flex;
          min-height: 100dvh;
          max-width: 1300px;
          margin: 0 auto;
          font-family: 'DM Sans', sans-serif;
        }
        .sidebar-left  { display: flex; }
        .sidebar-right { display: flex; }
        .main-content  {
          flex: 1;
          border-left: 1px solid var(--color-border);
          border-right: 1px solid var(--color-border);
          min-height: 100dvh;
          min-width: 0;
        }
        .mobile-nav    { display: none; }
        .mobile-header { display: none; }

        @media (max-width: 767px) {
          .main-layout   { max-width: 100%; }
          .sidebar-left  { display: none; }
          .sidebar-right { display: none; }
          .main-content  {
            border: none;
            padding-bottom: calc(64px + env(safe-area-inset-bottom));
          }
          .mobile-nav    { display: flex; }
          .mobile-header { display: block; }
        }
        @media (min-width: 768px) and (max-width: 1100px) {
          .sidebar-right { display: none; }
          .main-content  { border-right: none; }
        }
      `}</style>

      <div className="main-layout">
        <div className="sidebar-left">
          <SidebarNav profile={profile} unreadCount={unreadCount} />
        </div>

        <main className="main-content">
          <div className="mobile-header">
            <MobileHeader profile={profile} unreadCount={unreadCount} />
          </div>
          {children}
        </main>

        <div className="sidebar-right">
          <RightSidebar profile={profile} walletBalance={wallet?.balance_kobo || 0} />
        </div>
      </div>

      <div className="mobile-nav">
        <MobileBottomNav unreadCount={unreadCount} />
      </div>
    </AppThemeProvider>
  )
}