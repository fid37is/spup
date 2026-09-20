'use client'

import { useEffect } from 'react'

/**
 * In the Capacitor (Android/iOS) app, hides the native splash screen as soon
 * as the web app has mounted, instead of leaving it up for a fixed time.
 * capacitor.config.ts still caps the splash at 500ms as a safety net, so on a
 * very slow connection it can never hang around waiting for this to run.
 *
 * On the plain web/PWA this does nothing and loads nothing extra (the check
 * uses the global Capacitor injects into its own WebView, not an import).
 */
export default function NativeSplashHider() {
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (!cap?.isNativePlatform?.()) return

    import('@capacitor/splash-screen')
      .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 150 }))
      .catch(() => {})
  }, [])

  return null
}
