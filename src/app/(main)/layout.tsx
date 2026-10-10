import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { getAuthUser, createAdminClient, createClient } from '@/lib/supabase/server'
import { getProfileByAuthId, getOnboardingProgress, getUnreadNotificationCount } from '@/lib/queries'
import { getUnreadChatCount } from '@/lib/queries/chat'
import SidebarNav from '@/components/layout/sidebar-nav'
import RightSidebar from '@/components/layout/right-sidebar'
import MobileBottomNav from '@/components/layout/mobile-bottom-nav'
import MobileHeader from '@/components/layout/mobile-header'
import PushNotificationsProvider from '@/components/layout/push-notifications-provider'
import ChatCacheGuard from '@/components/chat/chat-cache-guard'
import ActivityBeacon from '@/components/layout/activity-beacon' 
import AutoplayPrefSync from '@/components/layout/autoplay-pref-sync'
import EngagementSyncProvider from '@/components/layout/engagement-sync-provider'
import NativePullToRefresh from '@/components/layout/native-pull-to-refresh'
import SupportResourcesHost from '@/components/layout/support-resources-host'
import PostingProvider from '@/components/layout/posting-provider'
import AnnouncementProvider from '@/components/layout/announcement-provider'
import { DISMISSED_COOKIE, parseDismissed, type FeedAnnouncement } from '@/lib/announcements'
import { LanguageProvider } from '@/lib/i18n/language-context'
import { isLocale, DEFAULT_LOCALE, loadDictionary } from '@/lib/i18n/dictionaries'


// Mutuals = people you follow who also follow you. Only the mobile drawer shows
// the number, so it must NOT hold up the whole app: this is started without being
// awaited and streamed to the header, which shows a dash until it arrives. (It used
// to be two unbounded follows scans that every page load waited on before sending
// a single byte of HTML.)
async function countMutuals(admin: ReturnType<typeof createAdminClient>, profileId: string): Promise<number> {
  try {
    const [youFollow, followYou] = await Promise.all([
      admin.from('follows').select('following_id').eq('follower_id', profileId),
      admin.from('follows').select('follower_id').eq('following_id', profileId),
    ])
    const youFollowSet = new Set((youFollow.data || []).map((r: { following_id: string }) => r.following_id))
    const followYouSet = new Set((followYou.data || []).map((r: { follower_id: string }) => r.follower_id))
    return [...youFollowSet].filter(id => followYouSet.has(id)).length
  } catch {
    return 0
  }
}

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

  // The DB (not a cookie) is the source of truth for locale: this layout is
  // already fully dynamic (auth-gated, no caching), so it re-reads
  // language_preference fresh on every request — no separate cookie sync
  // needed, and no risk of the two disagreeing across devices.
  const locale = isLocale(profile.language_preference) ? profile.language_preference : DEFAULT_LOCALE

  // ── Step 2: onboarding + sidebar data all in parallel ──────────────────────
  const admin = createAdminClient()
  // Live announcement banners. Uses the person's own client so RLS decides what is
  // live. Any failure - including the table not existing yet - means "no banner";
  // it must never take the app down.
  const userClient = await createClient()
  const liveAnnouncements = Promise.resolve(
    userClient
      .from('announcements')
      .select('id, kind, title, body, cta_label, cta_url, ends_at, remind_after_hours')
      .order('created_at', { ascending: false })
      .limit(5)
  ).then(r => (r.data ?? []) as FeedAnnouncement[], () => [] as FeedAnnouncement[])

  // Not awaited - see countMutuals above.
  const mutualsCount = countMutuals(admin, profile.id)

  const [onboardingProgress, unreadCount, unreadChat, initialMessages, announcementRows] = await Promise.all([
    getOnboardingProgress(profile.id),
    getUnreadNotificationCount(profile.id),
    getUnreadChatCount(profile.id),
    loadDictionary(locale),
    liveAnnouncements,
  ])
  const dismissedAnnouncements = parseDismissed((await cookies()).get(DISMISSED_COOKIE)?.value)

  if (!onboardingProgress?.completed_at) redirect('/onboarding')

  return (
    <LanguageProvider initialLocale={locale} initialMessages={initialMessages}>
      <PushNotificationsProvider userId={profile.id} />
      <ChatCacheGuard userId={profile.id} />
      <ActivityBeacon />
      <AutoplayPrefSync value={profile.autoplay_preference} />
      <EngagementSyncProvider />
      <NativePullToRefresh />
      <SupportResourcesHost />
      <PostingProvider>
      {/* eslint-disable-next-line react-hooks/purity -- server component: the server's clock is handed to the
          provider on purpose so the first client render matches what the server rendered */}
      <AnnouncementProvider initialRows={announcementRows} initialDismissed={dismissedAnnouncements} initialNow={Date.now()}>
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
        /* Announcements: in the feed on phones and tablets; at the top of the right
           column on desktop, which is where the in-feed copy steps aside. */
        @media (min-width: 1101px) {
          .announcement-in-feed { display: none; }
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
      </AnnouncementProvider>
      </PostingProvider>
    </LanguageProvider>
  )
}