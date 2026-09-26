import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getAuthUser, createAdminClient } from '@/lib/supabase/server'
import { getProfileByAuthId, getOnboardingProgress, getUnreadNotificationCount } from '@/lib/queries'
import { getWallet } from '@/lib/queries'
import { getUnreadChatCount } from '@/lib/queries/chat'
import SidebarNav from '@/components/layout/sidebar-nav'
import RightSidebar from '@/components/layout/right-sidebar'
import MobileBottomNav from '@/components/layout/mobile-bottom-nav'
import MobileHeader from '@/components/layout/mobile-header'
import PushNotificationsProvider from '@/components/layout/push-notifications-provider'
import ActivityBeacon from '@/components/layout/activity-beacon' 


export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  // ── Step 1: profile + onboarding in parallel (both need auth_id, not profile.id) ──
  const [profile, onboarding] = await Promise.all([
    getProfileByAuthId(user.id),
    // We'll re-check onboarding after we have profile.id — but we can optimistically
    // fetch profile first, then gate on both results together
    Promise.resolve(null), // placeholder — see step 2
  ])

  if (!profile) redirect('/login')
  if (profile.status === 'banned') redirect('/banned')

  // ── Step 2: onboarding + sidebar data all in parallel ──────────────────────
  const admin = createAdminClient()
  const [onboardingProgress, unreadCount, unreadChat, wallet, youFollow, followYou] = await Promise.all([
    getOnboardingProgress(profile.id),
    getUnreadNotificationCount(profile.id),
    getUnreadChatCount(profile.id),
    getWallet(profile.id),
    admin.from('follows').select('following_id').eq('follower_id', profile.id),
    admin.from('follows').select('follower_id').eq('following_id', profile.id),
  ])

  if (!onboardingProgress?.completed_at) redirect('/onboarding')

  // Mutuals count for the mobile drawer's profile header (not a denormalized
  // column like followers_count/following_count, so it's computed here —
  // same intersection logic used for a viewed profile's mutuals stat).
  const youFollowSet = new Set((youFollow.data || []).map((r: { following_id: string }) => r.following_id))
  const followYouSet = new Set((followYou.data || []).map((r: { follower_id: string }) => r.follower_id))
  const mutualsCount = [...youFollowSet].filter(id => followYouSet.has(id)).length

  return (
    <>
      <PushNotificationsProvider userId={profile.id} />
      <ActivityBeacon />
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
        /* A chat thread owns the whole screen on phones (its own header + composer),
           so the app's top bar and bottom tab bar step aside. Set by ChatViewport. */
        html[data-chat-open] .mobile-nav,
        html[data-chat-open] .mobile-header { display: none !important; }
        /* Notifications and its Settings/New-posts sub-pages draw their own
           sticky header (title, back arrow, tabs) - see HideMobileHeader. */
        html[data-notif-open] .mobile-header { display: none !important; }
        @media (min-width: 768px) and (max-width: 1100px) {
          .sidebar-right { display: none; }
          .main-content  { border-right: none; }
        }
      `}</style>

      <div className="main-layout">
        <div className="sidebar-left">
          <SidebarNav profile={profile} unreadCount={unreadCount} unreadChat={unreadChat} />
        </div>

        <main className="main-content">
          <div className="mobile-header">
            <MobileHeader profile={profile} unreadCount={unreadCount} mutualsCount={mutualsCount} />
          </div>
          {children}
        </main>

        <div className="sidebar-right">
          <Suspense fallback={<aside style={{ width: 300, flexShrink: 0 }} />}>
            <RightSidebar profile={profile} />
          </Suspense>
        </div>
      </div>

      <div className="mobile-nav">
        <MobileBottomNav unreadCount={unreadCount} unreadChat={unreadChat} userId={profile.id} />
      </div>
    </>
  )
}