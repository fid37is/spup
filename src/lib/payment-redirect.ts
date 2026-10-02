import { NextResponse } from 'next/server'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

/**
 * Where to send the user after a payment is verified.
 *  - Web:        the normal page on the site.
 *  - Native app: com.spup.app://open?path=<page> so Android returns the
 *                user to the app, which then opens that page.
 * `path` must be a site-relative path such as "/wallet?topup=success".
 */
export function paymentRedirect(path: string, isApp: boolean) {
  if (!isApp) return NextResponse.redirect(`${BASE_URL}${path}`)
  return new NextResponse(null, {
    status: 302,
    headers: { Location: `com.spup.app://open?path=${encodeURIComponent(path)}` },
  })
}
