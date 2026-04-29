import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_ROUTES = ['/feed', '/profile', '/notifications', '/messages', '/settings', '/onboarding', '/wallet', '/explore']
const AUTH_ROUTES = ['/login', '/signup', '/verify-otp', '/forgot-password']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('host') ?? ''

  // ── Admin subdomain routing ────────────────────────────────────────────────
  // admin.spup.live/ or admin.localhost:3000/ → internally serves /admin/*
  if (host.startsWith('admin.')) {
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = pathname === '/' ? '/admin' : `/admin${pathname}`
    const response = NextResponse.rewrite(rewriteUrl)
    // Share the auth session cookie across subdomains by setting cookie domain
    // to the root domain (e.g. .localhost or .spup.live)
    const rootDomain = host.replace('admin.', '')
    request.cookies.getAll().forEach(cookie => {
      if (cookie.name.includes('supabase') || cookie.name.includes('sb-')) {
        response.cookies.set(cookie.name, cookie.value, {
          domain: `.${rootDomain.split(':')[0]}`, // strip port
          path: '/',
          sameSite: 'lax',
          httpOnly: true,
          secure: !host.includes('localhost'),
        })
      }
    })
    return response
  }

  // Block /admin/* on the main domain — returns 404, not discoverable
  if (pathname.startsWith('/admin')) {
    return new NextResponse(null, { status: 404 })
  }

  // ── Supabase session handling ──────────────────────────────────────────────
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set('redirectTo', pathname)
    const redirectResponse = NextResponse.redirect(redirectUrl)
    supabaseResponse.cookies.getAll().forEach(cookie =>
      redirectResponse.cookies.set(cookie.name, cookie.value)
    )
    return redirectResponse
  }

  if (user && AUTH_ROUTES.some(route => pathname.startsWith(route))) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/feed'
    const redirectResponse = NextResponse.redirect(redirectUrl)
    supabaseResponse.cookies.getAll().forEach(cookie =>
      redirectResponse.cookies.set(cookie.name, cookie.value)
    )
    return redirectResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons|splash|og|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}