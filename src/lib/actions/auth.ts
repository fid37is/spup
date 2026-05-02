// src/lib/actions/auth.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import {
  signupSchema, loginSchema, emailOtpSchema,
  profileSetupSchema, interestsSchema, completeSocialProfileSchema,
} from '@/lib/validations/schemas'
import type {
  SignupSchema, LoginSchema, EmailOtpSchema,
  ProfileSetupSchema, InterestsSchema, CompleteSocialProfileSchema,
} from '@/lib/validations/schemas'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

/**
 * Get the public users.id for a given auth_id.
 * Uses the admin client so RLS never blocks a lookup.
 */
async function getProfileId(authId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('users')
    .select('id')
    .eq('auth_id', authId)
    .maybeSingle()
  if (error) console.error('getProfileId error:', error.message)
  return data?.id ?? null
}

/**
 * Upsert onboarding_progress for a profile.
 * Uses admin client — called right after profile insert, before session exists.
 */
async function upsertOnboarding(profileId: string, updates: Record<string, unknown> = {}) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('onboarding_progress')
    .upsert({ user_id: profileId, step: 0, ...updates }, { onConflict: 'user_id' })
  if (error) console.error('upsertOnboarding error:', error.message)
}

// ── Email signup ──────────────────────────────────────────────────────────────
// After signUp(), the user exists in auth.users but has NO session yet (email
// unconfirmed). The regular supabase client is therefore anonymous at this
// point, so any INSERT protected by RLS will fail with "new row violates RLS".
// Solution: use the service-role admin client for the profile insert.

export async function signUpAction(data: SignupSchema) {
  const parsed = signupSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { full_name, email, date_of_birth, password } = parsed.data
  const supabase = await createClient()
  const admin = createAdminClient()

  // Pre-check: is this email already in users table?
  const { data: existing } = await admin
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle()
  if (existing) return { error: 'An account with this email already exists.', field: 'email' }

  // Create auth user — Supabase sends a 6-digit OTP to the email
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, date_of_birth },
      emailRedirectTo: undefined, // forces OTP mode (not magic link)
    },
  })

  if (authError) {
    const msg = authError.message.toLowerCase()
    if (msg.includes('already registered') || msg.includes('already been registered')) {
      return { error: 'An account with this email already exists.', field: 'email' }
    }
    return { error: authError.message }
  }

  if (!authData.user) return { error: 'Signup failed. Please try again.' }

  const authId = authData.user.id
  const tempUsername = `user_${authId.slice(0, 8)}`

  // Insert profile using ADMIN client — bypasses RLS
  // status = pending_verification until OTP is confirmed
  const { data: newProfile, error: profileError } = await admin
    .from('users')
    .insert({
      auth_id: authId,
      email: email.toLowerCase(),
      display_name: full_name,
      username: tempUsername,
      role: 'user',
      status: 'pending_verification',
    })
    .select('id')
    .single()

  if (profileError) {
    console.error('Profile insert error:', profileError.message)
    // Don't fail signup — user can still verify, profile will be created on verify
  } else if (newProfile) {
    // Create onboarding_progress row immediately so it's ready after verification
    await upsertOnboarding(newProfile.id)
  }

  return { success: true, email }
}

// ── Verify email OTP ──────────────────────────────────────────────────────────
// After verifyOtp(), the session IS established in the cookie. From this point
// the regular client works for the user's own rows.
// We still use admin for onboarding_progress upsert for safety.

export async function verifyEmailOtpAction(email: string, data: EmailOtpSchema) {
  const parsed = emailOtpSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const admin = createAdminClient()

  const { error: otpError } = await supabase.auth.verifyOtp({
    email,
    token: parsed.data.token,
    type: 'email',
  })
  if (otpError) return { error: 'Invalid or expired code. Please try again.' }

  // Session is now active — get the user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Verification succeeded but session was not established. Please log in.' }

  // Activate account using admin (avoids any RLS edge cases on status update)
  const { error: activateError } = await admin
    .from('users')
    .update({ status: 'active' })
    .eq('auth_id', user.id)

  if (activateError) console.error('Account activation error:', activateError.message)

  // Ensure profile + onboarding_progress exist
  // (handles edge case where profile insert failed at signup time)
  let profileId = await getProfileId(user.id)

  if (!profileId) {
    // Profile never got created — create it now
    const meta = user.user_metadata
    const { data: newProfile } = await admin
      .from('users')
      .insert({
        auth_id: user.id,
        email: email.toLowerCase(),
        display_name: meta?.full_name || 'Spup User',
        username: `user_${user.id.slice(0, 8)}`,
        role: 'user',
        status: 'active',
      })
      .select('id')
      .single()
    profileId = newProfile?.id ?? null
  }

  if (profileId) {
    await upsertOnboarding(profileId)
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

// ── Resend email OTP ──────────────────────────────────────────────────────────

export async function resendEmailOtpAction(email: string) {
  const supabase = await createClient()
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) return { error: 'Failed to resend code. Please wait a moment and try again.' }
  return { success: true }
}

// ── Email login ───────────────────────────────────────────────────────────────

export async function loginAction(data: LoginSchema, redirectTo = '/feed') {
  const parsed = loginSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('email not confirmed')) {
      return {
        error: 'Please verify your email first.',
        needsVerification: true,
        email: parsed.data.email,
      }
    }
    if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
      return { error: 'Wrong email or password. Please try again.' }
    }
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect(redirectTo)
}

// ── OAuth (Google / Facebook) ─────────────────────────────────────────────────

export async function getOAuthUrlAction(provider: 'google' | 'facebook') {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
      scopes: provider === 'google' ? 'email profile' : 'email public_profile',
      queryParams: provider === 'google'
        ? { access_type: 'offline', prompt: 'consent' }
        : {},
    },
  })
  if (error || !data.url) return { error: error?.message || 'OAuth failed' }
  return { url: data.url }
}

// ── Sign out ──────────────────────────────────────────────────────────────────

export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

// ── OAuth callback ────────────────────────────────────────────────────────────
// Called from /api/auth/callback after OAuth redirect completes.
// Session is already established by the time this runs.

export async function handleOAuthCallbackAction() {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'No user session' }

  const admin = createAdminClient()

  // Check if profile already exists
  const { data: existing } = await admin
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (existing) {
    // Returning user — ensure onboarding_progress row exists
    await upsertOnboarding(existing.id)
    return { success: true, isNewUser: false }
  }

  // New OAuth user — create profile + onboarding using admin client
  const meta = user.user_metadata
  const fullName = meta?.full_name || meta?.name || ''

  const { data: newProfile, error: profileError } = await admin
    .from('users')
    .insert({
      auth_id: user.id,
      email: user.email ? user.email.toLowerCase() : null,
      display_name: fullName || 'Spup User',
      username: `user_${user.id.slice(0, 8)}`,
      role: 'user',
      status: 'active', // OAuth = already verified by provider
    })
    .select('id')
    .single()

  if (profileError) {
    console.error('OAuth profile insert error:', profileError.message)
    return { error: 'Failed to create profile.' }
  }

  if (newProfile) {
    await upsertOnboarding(newProfile.id)
  }

  return { success: true, isNewUser: true }
}

// ── Complete social profile (name + DoB after OAuth) ─────────────────────────

export async function completeSocialProfileAction(data: CompleteSocialProfileSchema) {
  const parsed = completeSocialProfileSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  await supabase
    .from('users')
    .update({ display_name: parsed.data.full_name })
    .eq('auth_id', user.id)

  await supabase.auth.updateUser({
    data: { date_of_birth: parsed.data.date_of_birth },
  })

  return { success: true }
}

// ── Onboarding: save username ─────────────────────────────────────────────────

export async function checkUsernameAvailableAction(username: string) {
  if (!username || username.length < 3) return { available: false }
  const admin = createAdminClient()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // IMPORTANT: Supabase query builder is immutable — .neq() returns a NEW builder.
  // Calling query.neq() without reassigning discards the filter entirely,
  // making every username appear available to the current user.
  const { data } = await (
    user
      ? admin.from('users').select('id').eq('username', username.toLowerCase()).neq('auth_id', user.id).maybeSingle()
      : admin.from('users').select('id').eq('username', username.toLowerCase()).maybeSingle()
  )
  return { available: !data }
}

export async function saveUsernameAction(username: string) {
  if (!username || username.length < 3) return { error: 'Username must be at least 3 characters.' }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return { error: 'Letters, numbers and underscores only.' }
  if (username.length > 20) return { error: 'Username must be 20 characters or less.' }

  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const { data: taken } = await admin
    .from('users')
    .select('id')
    .eq('username', username.toLowerCase())
    .neq('auth_id', user.id)
    .maybeSingle()

  if (taken) return { error: 'That username is already taken. Try another one.' }

  const { error } = await supabase
    .from('users')
    .update({ username: username.toLowerCase() })
    .eq('auth_id', user.id)

  if (error) return { error: 'Failed to save username.' }

  const profileId = await getProfileId(user.id)
  if (profileId) await upsertOnboarding(profileId, { step: 1 })

  return { success: true }
}

// ── Onboarding: save avatar ───────────────────────────────────────────────────

export async function saveAvatarAction(avatarUrl: string) {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('users')
    .update({ avatar_url: avatarUrl })
    .eq('auth_id', user.id)

  if (error) return { error: 'Failed to save avatar.' }

  const profileId = await getProfileId(user.id)
  if (profileId) await upsertOnboarding(profileId, { step: 2 })

  return { success: true }
}

// ── Onboarding: save bio ──────────────────────────────────────────────────────

export async function saveBioAction(bio: string) {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('users')
    .update({ bio: bio.trim() || null })
    .eq('auth_id', user.id)

  if (error) return { error: 'Failed to save bio.' }

  const profileId = await getProfileId(user.id)
  if (profileId) await upsertOnboarding(profileId, { profile_complete: true, step: 3 })

  return { success: true }
}

// ── Onboarding: save interests ────────────────────────────────────────────────

export async function saveInterestsAction(data: InterestsSchema) {
  const parsed = interestsSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const profileId = await getProfileId(user.id)
  if (!profileId) return { error: 'Profile not found. Please try signing out and back in.' }

  await supabase.from('user_interests').delete().eq('user_id', profileId)

  const { error: insertError } = await supabase
    .from('user_interests')
    .insert(parsed.data.interests.map(interest => ({ user_id: profileId, interest })))

  if (insertError) {
    console.error('saveInterestsAction error:', insertError.message)
    return { error: 'Failed to save interests. Please try again.' }
  }

  await upsertOnboarding(profileId, { interests_set: true, step: 4 })

  return { success: true }
}

// ── Onboarding: mark complete ─────────────────────────────────────────────────

export async function completeOnboardingAction() {
  const { user } = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const profileId = await getProfileId(user.id)
  if (!profileId) return { error: 'Profile not found.' }

  await upsertOnboarding(profileId, {
    first_follow: true,
    completed_at: new Date().toISOString(),
  })

  revalidatePath('/', 'layout')
  redirect('/feed')
}

// ── Legacy: saveProfileAction (kept for backward compat) ─────────────────────

export async function saveProfileAction(data: ProfileSetupSchema) {
  const parsed = profileSetupSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const { data: taken } = await admin
    .from('users')
    .select('id')
    .eq('username', parsed.data.username)
    .neq('auth_id', user.id)
    .maybeSingle()

  if (taken) return { error: 'That username is already taken.' }

  const { error } = await supabase
    .from('users')
    .update({ username: parsed.data.username, bio: parsed.data.bio || null })
    .eq('auth_id', user.id)

  if (error) return { error: 'Failed to save profile.' }

  const profileId = await getProfileId(user.id)
  if (profileId) await upsertOnboarding(profileId, { profile_complete: true, step: 1 })

  return { success: true }
}