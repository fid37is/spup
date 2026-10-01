'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'

const HOME = '/feed'
const ROOT_TABS = ['/feed', '/explore', '/notifications', '/messages']

/**
 * Native-only behaviour for the Capacitor app. Renders nothing, and does
 * nothing on the web.
 *
 * Android back button:
 *  - on a sub-page          -> go back one page
 *  - on Explore/Alerts/Chat -> go to Home
 *  - on Home                -> send the app to the background (like most apps)
 *
 * Mounted once in src/app/layout.tsx, which never unmounts, so the listener
 * stays registered for the whole session (login pages included).
 */
export default function NativeBootstrap() {
  const router = useRouter()
  const pathname = usePathname()

  // Keep the latest pathname in a ref so the listener is registered once,
  // instead of being torn down and re-added on every navigation.
  const pathRef = useRef(pathname)
  useEffect(() => {
    pathRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let remove: (() => void) | undefined
    let cancelled = false

    import('@capacitor/app')
      .then(async ({ App }) => {
        const handle = await App.addListener('backButton', () => {
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

        // If the component unmounted while the plugin was loading,
        // remove the listener immediately instead of leaking it.
        if (cancelled) handle.remove()
        else remove = () => handle.remove()
      })
      .catch(() => {})

    return () => {
      cancelled = true
      remove?.()
    }
  }, [router])

  return null
}
