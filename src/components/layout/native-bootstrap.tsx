'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'

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

/**
 * Native-only behaviour for the Capacitor app. Renders nothing, and does
 * nothing on the web.
 *
 * 1. Android back button
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
    let lastUrl = ''
    let lastAt = 0

    const handleUrl = (url: string) => {
      // The same link can be reported twice (launch + event). Ignore the repeat.
      const now = Date.now()
      if (url === lastUrl && now - lastAt < 3000) return
      lastUrl = url
      lastAt = now

      let u: URL
      try {
        u = new URL(url)
      } catch {
        return
      }

      if (u.protocol === APP_SCHEME && u.host === AUTH_HOST) {
        // OAuth return trip. /api/auth/callback is a route handler (not a
        // page), so this must be a real navigation, not router.push.
        window.location.assign(`/api/auth/callback${u.search}`)
        return
      }

      if (u.protocol === APP_SCHEME && u.host === OPEN_HOST) {
        // Only accept site-relative paths, never another host.
        const path = u.searchParams.get('path') ?? ''
        if (path.startsWith('/') && !path.startsWith('//')) router.push(path)
        return
      }

      if (u.protocol === 'https:' && /(^|\.)spup\.live$/.test(u.hostname)) {
        router.push(u.pathname + u.search)
      }
    }

    import('@capacitor/app')
      .then(async ({ App }) => {
        const back = await App.addListener('backButton', () => {
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

        // Cold start: the app was closed and a notification tap launched it.
        const launch = await App.getLaunchUrl()
        if (launch?.url && !cancelled) handleUrl(launch.url)
      })
      .catch(() => {})

    return () => {
      cancelled = true
      removers.forEach(r => r())
    }
  }, [router])

  return null
}
