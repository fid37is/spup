// src/app/api/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { generateUniqueUsername } from '@/lib/username'
import { hasRealName } from '@/lib/validations/schemas'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/feed'

  if (!code) return NextResponse.redirect(`${origin}/login?error=no_code`)

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) return NextResponse.redirect(`${origin}/login?error=auth_failed`)

  // Check if this is a new OAuth user (no profile yet)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${origin}/login`)

  const { data: profile } = await supabase
    .from('users')
    .select('id, status')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (!profile) {
    // Brand new OAuth user — create minimal profile, then collect DoB
    const meta = user.user_metadata
    const rawName = meta?.full_name || meta?.name || ''
    const fullName = hasRealName(rawName) ? rawName.trim() : 'Spup User'
    // Read-only uniqueness checks - the insert below keeps using the
    // session-scoped client, unchanged from before.
    const admin = createAdminClient()

    await supabase.from('users').insert({
      auth_id: user.id,
      email: user.email || null,
      display_name: fullName,
      username: await generateUniqueUsername(admin, fullName),
      role: 'user',
      status: 'active',
    })

    // Redirect to complete-profile to collect DoB (and optionally name)
    return NextResponse.redirect(`${origin}/complete-profile`)
  }

  // Returning user — check if onboarding is done
  const { data: onboarding } = await supabase
    .from('onboarding_progress')
    .select('completed_at')
    .eq('user_id', profile.id)
    .maybeSingle()

  if (!onboarding?.completed_at) {
    return NextResponse.redirect(`${origin}/onboarding`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}