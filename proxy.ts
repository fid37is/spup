import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { authCookieOptions } from '@/lib/supabase/cookie-options'

const PROTECTED_ROUTES = ['/feed', '/profile', '/notifications', '/messages', '/settings', '/onboarding', '/wallet', '/explore']
const AUTH_ROUTES = ['/login', '/signup', '/verify-otp', '/forgot-password']
const ADMIN_ROLES = ['admin', 'moderator']

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
      cookieOptions: authCookieOptions,
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

  // getClaims() instead of getUser(): verifies the JWT signature locally
  // against a cached JWKS endpoint rather than making a network round-trip
  // to Supabase's Auth API on every single request. Safe specifically
  // because this value only drives redirect routing below — every actual
  // authorization decision (requireAdmin, server actions reading/writing
  // sensitive data) does its own independent getUser() call server-side
  // rather than trusting this one. Falls back to null on any verification
  // failure, same as an absent user.
  const { data: claims } = await supabase.auth.getClaims()
  const user = claims?.claims ? { id: claims.claims.sub } : null

  // Carries the refreshed session cookies (if any were reissued above) onto
  // whatever final response this request ends up producing.
  //
  // BUG FIXED HERE: this used to do
  //   response.cookies.set(cookie.name, cookie.value)
  // which drops every attribute except name/value — domain, secure,
  // sameSite, httpOnly, maxAge all silently fall back to Next's raw
  // defaults (no domain, NOT secure, NOT httpOnly) instead of
  // authCookieOptions. That's exactly the "works on local, breaks on
  // prod" split: in dev, authCookieOptions has no meaningful domain and
  // secure:false anyway, so the downgrade is invisible. In prod,
  // authCookieOptions sets domain:'spup.live' and secure:true — so any
  // time this function actually re-issues a cookie (a token refresh
  // happening on the same request as an auth-route redirect, which is
  // exactly the "logs in, immediately logs back out" moment right after
  // login), the reissued cookie silently loses its Secure attribute and
  // its cross-subdomain Domain, and can end up not matching the cookie
  // the browser already has — the classic "two different cookies"
  // failure mode. `cookie` here already carries every original
  // attribute (getAll() returns full ResponseCookie objects, not just
  // name/value) — passing it through whole, instead of just its name
  // and value, is the actual fix.
  function withRefreshedCookies(response: NextResponse) {
    refreshedResponse.cookies.getAll().forEach(cookie => {
      response.cookies.set(cookie)
    })
    return response
  }

  // ── Cross-domain identity guard ────────────────────────────────────────────
  // The auth cookie is deliberately shared across spup.live and
  // admin.spup.live (see cookie-options.ts), and users.role is the only
  // thing distinguishing an admin/moderator account from an ordinary one.
  // loginAction rejects a mismatched host at sign-in time, but this is the
  // second line of defense — it also catches sessions that predate that
  // check, or that arrive via OAuth (which doesn't go through loginAction
  // at all). Any already-established session whose role doesn't match its
  // host gets signed out and bounced to that host's /login. Static assets,
  // _next, and API routes are left alone so this can't loop or break asset
  // loading.
  let role: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('auth_id', user.id)
      .maybeSingle()
    role = profile?.role ?? null
  }

  const isStatic = /\.(js|json|png|jpg|jpeg|svg|webp|ico|css|txt|xml)$/.test(pathname)

  if (user && !isStatic && !pathname.startsWith('/_next') && !pathname.startsWith('/api/')) {
    const isAdminRole = ADMIN_ROLES.includes(role ?? '')

    if (isAdminHost && !isAdminRole) {
      await supabase.auth.signOut()
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/login'
      redirectUrl.searchParams.set('error', 'admin_only')
      return withRefreshedCookies(NextResponse.redirect(redirectUrl))
    }

    if (!isAdminHost && isAdminRole) {
      await supabase.auth.signOut()
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/login'
      redirectUrl.searchParams.set('error', 'use_admin_domain')
      return withRefreshedCookies(NextResponse.redirect(redirectUrl))
    }
  }

  // ── Admin subdomain routing ────────────────────────────────────────────────
  // admin.spup.live/ or admin.localhost:3000/ → internally serves /dashboard/*
  // Auth routes (/login, /signup etc.) pass through unchanged — the admin
  // layout redirects unauthenticated users to /login, which must stay as-is
  if (isAdminHost) {
    const AUTH_PASS = ['/login', '/signup', '/forgot-password', '/verify-otp', '/verify-email', '/api/']
    const isAuthRoute = AUTH_PASS.some(r => pathname.startsWith(r))

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