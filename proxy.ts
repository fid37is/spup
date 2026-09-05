import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_ROUTES = ['/feed', '/profile', '/notifications', '/messages', '/settings', '/onboarding', '/wallet', '/explore']
const AUTH_ROUTES = ['/login', '/signup', '/verify-otp', '/forgot-password']
const isProd = process.env.NODE_ENV === 'production'
const cookieDomain = isProd ? '.spup.live' : '.localhost'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('host') ?? ''
  const isAdminHost = host.startsWith('admin.')

  // ── Supabase session refresh — runs for EVERY host, admin subdomain included ──
  // This must run unconditionally: it's the only place with cookie-write access,
  // so it's the only place that can refresh an expiring access token. Skipping it
  // for any host means sessions on that host silently go stale and bounce users
  // back to /login even though their refresh token was still valid.
  let refreshedResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        domain: cookieDomain,
        sameSite: 'lax',
        secure: isProd,
        path: '/',
      },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          refreshedResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            refreshedResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Carries the refreshed session cookies (if any were reissued above) onto
  // whatever final response this request ends up producing.
  function withRefreshedCookies(response: NextResponse) {
    refreshedResponse.cookies.getAll().forEach(cookie => {
      response.cookies.set(cookie.name, cookie.value)
    })
    return response
  }

  // ── Admin subdomain routing ────────────────────────────────────────────────
  // admin.spup.live/ or admin.localhost:3000/ → internally serves /dashboard/*
  // Auth routes (/login, /signup etc.) pass through unchanged — the admin
  // layout redirects unauthenticated users to /login, which must stay as-is
  if (isAdminHost) {
    const AUTH_PASS = ['/login', '/signup', '/forgot-password', '/verify-otp', '/verify-email', '/api/']
    const isAuthRoute = AUTH_PASS.some(r => pathname.startsWith(r))
    const isStatic = /\.(js|json|png|jpg|jpeg|svg|webp|ico|css|txt|xml)$/.test(pathname)

    if (isAuthRoute || isStatic || pathname.startsWith('/_next')) {
      return withRefreshedCookies(NextResponse.next())
    }

    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname =
      pathname === '/' ? '/dashboard'
      : pathname.startsWith('/dashboard') ? pathname   // avoid double-prefixing /dashboard/dashboard
      : `/dashboard${pathname}`

    const response = NextResponse.rewrite(rewriteUrl)
    return withRefreshedCookies(response)
  }

  // Block /dashboard/* on the main domain — returns 404, not discoverable
  if (pathname.startsWith('/dashboard')) {
    return new NextResponse(null, { status: 404 })
  }

  if (!user && PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set('redirectTo', pathname)
    return withRefreshedCookies(NextResponse.redirect(redirectUrl))
  }

  if (user && AUTH_ROUTES.some(route => pathname.startsWith(route))) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/feed'
    return withRefreshedCookies(NextResponse.redirect(redirectUrl))
  }

  return refreshedResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons|splash|og|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}