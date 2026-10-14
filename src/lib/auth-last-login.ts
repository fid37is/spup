// src/lib/auth-last-login.ts
//
// Remembers which sign-in method a person used most recently, so the login
// page can show a "Recent" badge on it, and detects when an OAuth sign-in has
// been auto-linked onto an existing email-and-password account.
//
// Safe to import from both server and client code (no server-only imports).
import type { User, UserIdentity } from '@supabase/supabase-js'

export const LAST_LOGIN_COOKIE = 'spup_last_login'
export type LoginMethod = 'email' | 'google' | 'facebook'

export function isLoginMethod(v: unknown): v is LoginMethod {
  return v === 'email' || v === 'google' || v === 'facebook'
}

// Not httpOnly on purpose: the login page reads it to show the badge. It holds
// only the method name, nothing sensitive. Host-only (no Domain) so it stays
// out of the admin subdomain's way.
export function lastLoginCookieOptions() {
  return {
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
  }
}

// Client only.
export function readLastLoginMethod(): LoginMethod | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.split('; ').find(c => c.startsWith(`${LAST_LOGIN_COOKIE}=`))
  const value = match ? decodeURIComponent(match.split('=')[1] ?? '') : ''
  return isLoginMethod(value) ? value : null
}

// The method behind the session that was just created: the identity with the
// newest last_sign_in_at. (app_metadata.provider is the FIRST provider the
// account ever used, so it is only a fallback.)
export function methodJustUsed(user: User): LoginMethod | null {
  const identities = [...(user.identities ?? [])]
  identities.sort(
    (a, b) => Date.parse(b.last_sign_in_at ?? b.created_at ?? '') - Date.parse(a.last_sign_in_at ?? a.created_at ?? ''),
  )
  const newest = identities[0]?.provider
  if (isLoginMethod(newest)) return newest
  const fallback = user.app_metadata?.provider
  return isLoginMethod(fallback) ? fallback : null
}

// An account that began with email + password and later got a Google/Facebook
// identity attached (Supabase auto-links an OAuth sign-in whose verified
// email matches an existing account). Order is what separates this from a
// Google-first account that later set a password: there the email identity is
// the newer one, so it is NOT flagged.
const LINK_GAP_MS = 60_000

export function findOAuthLinkedOntoEmailAccount(user: User): UserIdentity | null {
  const identities = user.identities ?? []
  const email = identities.find(i => i.provider === 'email')
  if (!email) return null
  const emailCreated = Date.parse(email.created_at ?? '')
  if (!Number.isFinite(emailCreated)) return null

  let linked: UserIdentity | null = null
  for (const i of identities) {
    if (i.provider === 'email') continue
    const created = Date.parse(i.created_at ?? '')
    if (Number.isFinite(created) && created - emailCreated > LINK_GAP_MS) linked = i
  }
  return linked
}
