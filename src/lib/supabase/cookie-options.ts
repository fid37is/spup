// src/lib/supabase/cookie-options.ts
//
// Single source of truth for the auth cookie's attributes. Every place that
// creates a Supabase server client — src/lib/supabase/server.ts (Server
// Components, Server Actions, Route Handlers) and proxy.ts (session refresh,
// admin-subdomain routing) — must use the EXACT same options. Before this
// file existed, `domain` was hardcoded separately in both places and they
// drifted out of sync (server.ts had '.localhost', proxy.ts had 'localhost'
// after an earlier fix attempt). Writing the auth cookie with one Domain
// value and refreshing it with another is exactly what "session disappears
// on reload" looks like, so the fix is to only ever define this once.
import type { CookieOptions } from '@supabase/ssr'

const isProd = process.env.NODE_ENV === 'production'

// This app intentionally shares the session cookie across a subdomain in
// BOTH environments — admin.spup.live in prod, admin.localhost:3000 in dev
// (see proxy.ts's admin-host routing) — so `domain` can't simply be omitted
// in dev; that would default the cookie to whichever exact host set it and
// break admin login locally.
//
// The bug was the leading dot: `.localhost` (or `.spup.live` written with a
// dot) is what RFC 6265 calls a "domain cookie", and Chrome rejects that
// Set-Cookie header outright when the label after the dot has no interior
// dot of its own (true for "localhost", NOT true for "spup.live"). Writing
// the bare hostname (`localhost`, no leading dot) is treated as an exact
// match for the current host and is accepted — and per the same spec, it
// still domain-matches subdomains like admin.localhost, so nothing is lost
// by dropping the dot.
export const cookieDomain: string = isProd
  ? process.env.NEXT_PUBLIC_COOKIE_DOMAIN ?? 'spup.live'
  : 'localhost'

export const authCookieOptions: CookieOptions = {
  domain: cookieDomain,
  sameSite: 'lax',
  secure: isProd,
  path: '/',
  // Outer bound on how long the cookie survives in the browser. Keep this
  // >= the inactivity window configured in Supabase (Authentication >
  // Sessions) so the cookie is never deleted client-side before Supabase
  // would have expired the session server-side anyway.
  maxAge: 60 * 60 * 24 * 30, // 30 days
}