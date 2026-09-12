import { createBrowserClient as _createBrowserClient } from '@supabase/ssr'
import { authCookieOptions } from './cookie-options'

export function createBrowserClient() {
  return _createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: authCookieOptions }
  )
}

export function createClient() {
  throw new Error('Function not implemented.')
}
