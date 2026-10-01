'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'

const HOME = '/feed'
const ROOT_TABS = ['/feed', '/explore', '/notifications', '/messages']

// Must match redirectTo in components/auth/oauth-buttons.tsx, the URL
// scheme in AndroidManifest.xml, and Supabase > Auth > Redirect URLs.
const AUTH_SCHEME = 'com.spup.app:'
const AUTH_HOST = 'auth'

/**
 * Native-only behaviour for the Capacitor app. Renders nothing, and does
 * nothing on the web.
 *
 * 1. Android back button
 *    - sub-page            -> back one page
 *    - Explore/Alerts/Chat -> Home
 *    - Home                -> send the app to the background
 *
 * 2. Deep links (appUrlOpen)
 *    - com.spup.app://auth/callback?code=...  (Google/Facebook sign-in
 *      returning from the system browser) -> finish sign-in via the
 *      existing /api/auth/callback route
 *    - https://spup.live/...                  (App Links, once verified)
 *      -> open that page inside the app
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

        const links = await App.addListener('appUrlOpen', ({ url }) => {
          let u: URL
          try {
            u = new URL(url)
          } catch {
            return
          }

          // OAuth return trip. /api/auth/callback is a route handler (not a
          // page), so this must be a real navigation, not router.push.
          if (u.protocol === AUTH_SCHEME && u.host === AUTH_HOST) {
            window.location.assign(`/api/auth/callback${u.search}`)
            return
          }

          // Normal https links to the site.
          if (u.protocol === 'https:' && /(^|\.)spup\.live$/.test(u.hostname)) {
            router.push(u.pathname + u.search)
          }
        })

        // If we unmounted while the plugin was loading, clean up now.
        if (cancelled) {
          back.remove()
          links.remove()
        } else {
          removers.push(() => back.remove(), () => links.remove())
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
      removers.forEach(r => r())
    }
  }, [router])

  return null
}
