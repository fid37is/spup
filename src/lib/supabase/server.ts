// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const isProd = process.env.NODE_ENV === 'production'
const cookieDomain = isProd ? '.spup.live' : '.localhost'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        domain: cookieDomain,
        sameSite: 'lax',
        secure: isProd,
        path: '/',
        // How long the cookie itself survives in the browser. This is the
        // outer bound — set it >= whatever inactivity window is configured
        // in the Supabase dashboard (Authentication > Sessions), so the
        // cookie never gets deleted client-side before Supabase would have
        // expired the session server-side anyway.
        maxAge: 60 * 60 * 24 * 30, // 30 days
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — cookies set by middleware
          }
        },
      },
    }
  )
}

// Admin client — only use in server actions/API routes, NEVER expose to client
export function createAdminClient() {
  const { createClient } = require('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}