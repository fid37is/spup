import { Capacitor } from '@capacitor/core'

/** True only inside the Capacitor app (never on the web). */
export const isNativeApp = () => Capacitor.isNativePlatform()

/**
 * Open a payment page.
 *  - Native app: system browser (Chrome Custom Tab). When payment finishes,
 *    the server sends the browser to com.spup.app://open?path=..., which
 *    brings the user back into the app (see NativeBootstrap).
 *  - Web: normal full-page redirect, same as before.
 */
export async function openCheckout(url: string) {
  if (!isNativeApp()) {
    window.location.href = url
    return
  }
  const { Browser } = await import('@capacitor/browser')
  await Browser.open({ url })
}
