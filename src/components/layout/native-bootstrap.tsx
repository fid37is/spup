'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { hasBackHandlers, onBackStackChange, runTopBackHandler } from '@/lib/native-back'

const HOME = '/feed'
const ROOT_TABS = ['/feed', '/explore', '/notifications', '/messages']

// Must match redirectTo in components/auth/oauth-buttons.tsx, the URL
// scheme in AndroidManifest.xml, and Supabase > Auth > Redirect URLs.
const APP_SCHEME = 'com.spup.app:'
const AUTH_HOST = 'auth'
// com.spup.app://open?path=/wallet%3Ftopup%3Dsuccess
// Built by src/lib/payment-redirect.ts (payment return trip) and by
// SpupMessagingService.java (user tapped a push notification).
const OPEN_HOST = 'open'

// Remembers which deep links were already acted on. sessionStorage survives
// the full page reloads that happen during sign-in (window.location.assign),
// whereas variables and refs inside this component are wiped by every one.
const SEEN_KEY = 'spup:deeplink-seen'
const LAUNCH_KEY = 'spup:launch-consumed'

function wasHandledRecently(url: string, withinMs: number): boolean {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY)
    if (!raw) return false
    const seen = JSON.parse(raw) as { url: string; at: number }
    return seen.url === url && Date.now() - seen.at < withinMs
  } catch {
    return false
  }
}

function markHandled(url: string) {
  try { sessionStorage.setItem(SEEN_KEY, JSON.stringify({ url, at: Date.now() })) } catch {}
}

/**
 * Android keeps reporting the same launch URL for as long as the app process
 * lives, and this component remounts on every full page load. Without this,
 * a sign-in link that happened to launch the app would be replayed after every
 * reload - and a sign-in code can only be used once.
 */
function consumeLaunchUrl(url: string): boolean {
  try {
    if (sessionStorage.getItem(LAUNCH_KEY) === url) return false
    sessionStorage.setItem(LAUNCH_KEY, url)
  } catch {}
  return true
}

// ─── AdMob banner (Android app only) ────────────────────────────────────────
// Spup's banner ad unit. NEXT_PUBLIC_ADMOB_BANNER_ID overrides it - e.g. set it to
// Google's public test banner (ca-app-pub-3940256099942544/6300978111) to see
// harmless test ads while checking the layout.
const BANNER_ID = process.env.NEXT_PUBLIC_ADMOB_BANNER_ID || 'ca-app-pub-5970584938854119/8668462467'
// Optional: comma-separated test-device IDs (shown in Logcat as "Use
// RequestConfiguration.Builder().setTestDeviceIds(...)") so YOUR phone only ever
// gets test ads - tapping your own live ads is against AdMob policy.
const TEST_DEVICES = (process.env.NEXT_PUBLIC_ADMOB_TEST_DEVICES ?? '')
  .split(',').map(s => s.trim()).filter(Boolean)
const AD_ROUTES = ['/feed', '/explore']   // exact paths that show the banner
const AD_GAP = 8                          // dp of air between the banner and the nav (accidental-tap policy)

let adsReady: Promise<boolean> | null = null
let bannerCreated = false
let bannerShown = false
let lastBannerHeight = 0
let bannerQueue: Promise<void> = Promise.resolve()

/** Height of the fixed bottom nav, so the banner can sit just above it. */
function bottomNavHeight(): number {
  for (const nav of Array.from(document.querySelectorAll('nav'))) {
    const cs = getComputedStyle(nav)
    if (cs.position === 'fixed' && cs.bottom === '0px') return Math.round(nav.getBoundingClientRect().height)
  }
  return 64
}

/** Room at the end of the page so the last post isn't hidden behind the banner. */
function setAdPadding(px: number) {
  document.body.style.paddingBottom = px > 0 ? `${px}px` : ''
}

/** Consent (EU/UK rules), then start the SDK. Runs once; false = ads unavailable this session. */
function ensureAds(): Promise<boolean> {
  if (!adsReady) {
    adsReady = (async () => {
      try {
        const { AdMob, AdmobConsentStatus } = await import('@capacitor-community/admob')
        let consent = await AdMob.requestConsentInfo()
        if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
          consent = await AdMob.showConsentForm()
        }
        if (!consent.canRequestAds) return false
        await AdMob.initialize(
          TEST_DEVICES.length ? { initializeForTesting: true, testingDevices: TEST_DEVICES } : undefined,
        )
        return true
      } catch (err) {
        console.error('[admob] could not start:', err)
        return false   // the app stays fully usable without ads
      }
    })()
  }
  return adsReady
}

/** Show or hide the banner. Calls are queued so quick changes can't overlap. */
function setBanner(visible: boolean): void {
  bannerQueue = bannerQueue.then(async () => {
    if (visible === bannerShown) return
    const { AdMob, BannerAdPluginEvents, BannerAdPosition, BannerAdSize } =
      await import('@capacitor-community/admob')

    if (visible) {
      if (!(await ensureAds())) return
      bannerShown = true
      try {
        if (!bannerCreated) {
          await AdMob.addListener(BannerAdPluginEvents.SizeChanged, size => {
            lastBannerHeight = size.height
            setAdPadding(bannerShown ? size.height + AD_GAP : 0)
          })
          await AdMob.showBanner({
            adId: BANNER_ID,
            adSize: BannerAdSize.ADAPTIVE_BANNER,
            position: BannerAdPosition.BOTTOM_CENTER,
            margin: bottomNavHeight() + AD_GAP,
          })
          bannerCreated = true
        } else {
          await AdMob.resumeBanner()
          setAdPadding(lastBannerHeight + AD_GAP)
        }
      } catch (err) {
        bannerShown = false
        throw err
      }
    } else {
      if (!bannerCreated) return
      bannerShown = false
      setAdPadding(0)
      await AdMob.hideBanner()
    }
  }).catch(err => console.error('[admob] banner error:', err))
}

/**
 * Native-only behaviour for the Capacitor app. Renders nothing, and does
 * nothing on the web.
 *
 * 1. Android back button
 *    - a popup is open     -> close that popup (see hooks/use-back-close.ts)
 *    - sub-page            -> back one page
 *    - Explore/Alerts/Chat -> Home
 *    - Home                -> send the app to the background
 *
 * 2. Deep links - one handler for both ways a link can arrive:
 *    - appUrlOpen    : the app was already running
 *    - getLaunchUrl  : the app was closed and the link started it
 *    Links understood:
 *    - com.spup.app://auth/callback?code=...  (Google/Facebook sign-in
 *      returning from the system browser) -> finish sign-in via the
 *      existing /api/auth/callback route
 *    - com.spup.app://open?path=/some/page    (payment return, or a tapped
 *      push notification) -> open that page inside the app
 *    - https://spup.live/...                  (App Links, once verified)
 *
 * 3. AdMob banner (Android app only) - shown above the bottom nav on the feed
 *    and explore screens, hidden elsewhere, while a popup is open, and while
 *    the keyboard is up. The website's AdSense can't run inside the app.
 *
 * Mounted once in src/app/layout.tsx, which never unmounts, so the
 * listeners stay registered for the whole session (login pages included).
 */
export default function NativeBootstrap() {
  const router = useRouter()
  const pathname = usePathname()

  // Latest pathname in a ref so listeners are registered once, not
  // torn down and re-added on every navigation.
  const pathRef = useRef(pathname)
  useEffect(() => {
    pathRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const removers: Array<() => void> = []
    let cancelled = false

    const handleUrl = (url: string) => {
      let u: URL
      try {
        u = new URL(url)
      } catch {
        return
      }

      // The same link can be reported twice (launch + event), so a repeat is
      // skipped. Sign-in links carry a single-use code, so those are blocked for
      // a minute. Everything else is just navigation: only the double delivery
      // (a few seconds) is ignored, NOT a second real tap - every message in one
      // chat produces the identical link, and that tap must still open the chat.
      if (wasHandledRecently(url, u.host === AUTH_HOST ? 60_000 : 3_000)) return
      markHandled(url)
      // TEMPORARY diagnostics: never logs the query string (it holds the sign-in code).
      console.log('[spup-auth] link received:', u.protocol + '//' + u.host + u.pathname)

      if (u.protocol === APP_SCHEME && u.host === AUTH_HOST) {
        // OAuth return trip. /api/auth/callback is a route handler (not a
        // page), so this must be a real navigation, not router.push.
        window.location.assign(`/api/auth/callback${u.search}`)
        return
      }

      if (u.protocol === APP_SCHEME && u.host === OPEN_HOST) {
        // Only accept site-relative paths, never another host.
        const path = u.searchParams.get('path') ?? ''
        if (path.startsWith('/') && !path.startsWith('//')) {
          // MainActivity may already have loaded this exact page; don't stack a duplicate.
          const here = window.location.pathname + window.location.search
          if (path !== here) router.push(path)
        }
        return
      }

      if (u.protocol === 'https:' && /(^|\.)spup\.live$/.test(u.hostname)) {
        router.push(u.pathname + u.search)
      }
    }

    import('@capacitor/app')
      .then(async ({ App }) => {
        const back = await App.addListener('backButton', () => {
          // An open popup (compose, media viewer, report...) gets back first.
          if (runTopBackHandler()) return

          const path = pathRef.current

          if (path === HOME) {
            App.minimizeApp()
          } else if (ROOT_TABS.includes(path)) {
            router.push(HOME)
          } else if (window.history.length > 1) {
            router.back()
          } else {
            // Opened straight onto a sub-page (e.g. from a notification),
            // so there is no history to go back to.
            router.push(HOME)
          }
        })

        const links = await App.addListener('appUrlOpen', ({ url }) => handleUrl(url))

        // If we unmounted while the plugin was loading, clean up now.
        if (cancelled) {
          back.remove()
          links.remove()
          return
        }
        removers.push(() => back.remove(), () => links.remove())
        console.log('[spup-auth] listeners ready')

        // Cold start: the app was closed and a notification tap launched it.
        const launch = await App.getLaunchUrl()
        console.log('[spup-auth] launch url present:', !!launch?.url)
        if (launch?.url && !cancelled && consumeLaunchUrl(launch.url)) handleUrl(launch.url)
      })
      .catch(() => {})

    return () => {
      cancelled = true
      removers.forEach(r => r())
    }
  }, [router])

  // AdMob banner: on the feed and explore screens only, and out of the way of
  // popups and the keyboard. Android app only - the website uses AdSense.
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return

    const onAdRoute = AD_ROUTES.includes(pathname)
    let tallest = window.innerHeight
    let keyboardOpen = false

    const apply = () => setBanner(onAdRoute && !keyboardOpen && !hasBackHandlers())
    const onResize = () => {
      // The window shrinks a lot when the keyboard opens.
      tallest = Math.max(tallest, window.innerHeight)
      keyboardOpen = window.innerHeight < tallest * 0.75
      apply()
    }

    apply()
    const offStack = onBackStackChange(apply)   // a popup opened or closed
    window.addEventListener('resize', onResize)
    return () => {
      offStack()
      window.removeEventListener('resize', onResize)
    }
  }, [pathname])

  return null
}