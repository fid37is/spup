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

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

// ── Helper: get profile id safely, with clear error ───────────────────────────
async function getProfileId(supabase: Awaited<ReturnType<typeof createClient>>, authId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', authId)
    .maybeSingle()

  if (error) {
    console.error('getProfileId error:', error.message)
    return null
  }
  return data?.id ?? null
}

// ── Helper: upsert onboarding_progress safely ────────────────────────────────
// Creates the row if it doesn't exist yet (e.g. OAuth users who skipped steps)
async function upsertOnboardingProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  updates: Record<string, unknown>
) {
  const { error } = await supabase
    .from('onboarding_progress')
    .upsert(
      { user_id: profileId, ...updates },
      { onConflict: 'user_id' }
    )

  if (error) console.error('upsertOnboardingProgress error:', error.message)
}

// ─── Email signup ─────────────────────────────────────────────────────────────

export async function signUpAction(data: SignupSchema) {
  const parsed = signupSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { full_name, email, date_of_birth, password } = parsed.data
  const supabase = await createClient()

  const { data: existingProfile } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle()

  if (existingProfile) {
    return { error: 'An account with this email already exists.', field: 'email' }
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, date_of_birth },
      emailRedirectTo: undefined,
    },
  })

  if (authError) {
    if (
      authError.message.toLowerCase().includes('already registered') ||
      authError.message.toLowerCase().includes('user already registered') ||
      authError.message.toLowerCase().includes('already been registered')
    ) {
      return { error: 'An account with this email already exists.', field: 'email' }
    }
    return { error: authError.message }
  }

  if (!authData.user) return { error: 'Signup failed. Please try again.' }

  const tempUsername = `user_${authData.user.id.slice(0, 8)}`

  const { error: profileError } = await supabase.from('users').insert({
    auth_id: authData.user.id,
    email: email.toLowerCase(),
    display_name: full_name,
    username: tempUsername,
    role: 'user',
    status: 'pending_verification',
  })

  if (profileError) {
    console.error('Profile creation error:', profileError.message)
  }

  return { success: true, email }
}

// ─── Verify email OTP ─────────────────────────────────────────────────────────

export async function verifyEmailOtpAction(email: string, data: EmailOtpSchema) {
  const parsed = emailOtpSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: parsed.data.token,
    type: 'email',
  })

  if (error) return { error: 'Invalid or expired code. Please try again.' }

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    // Activate account
    await supabase
      .from('users')
      .update({ status: 'active' })
      .eq('auth_id', user.id)

    // Ensure onboarding_progress row exists — create if missing
    const profileId = await getProfileId(supabase, user.id)
    if (profileId) {
      await supabase
        .from('onboarding_progress')
        .upsert({ user_id: profileId, step: 0 }, { onConflict: 'user_id' })
    }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

// ─── Resend email OTP ─────────────────────────────────────────────────────────

export async function resendEmailOtpAction(email: string) {
  const supabase = await createClient()
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) return { error: 'Failed to resend code. Please wait a moment.' }
  return { success: true }
}

// ─── Email login ──────────────────────────────────────────────────────────────

export async function loginAction(data: LoginSchema) {
  const parsed = loginSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      return { error: 'Wrong email or password. Please try again.' }
    }
    if (error.message.includes('Email not confirmed')) {
      return {
        error: 'Please verify your email first.',
        needsVerification: true,
        email: parsed.data.email,
      }
    }
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

// ─── OAuth ────────────────────────────────────────────────────────────────────

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

// ─── Sign out ─────────────────────────────────────────────────────────────────

export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

// ─── OAuth callback ───────────────────────────────────────────────────────────

export async function handleOAuthCallbackAction() {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'No user session' }

  const { data: existing } = await supabase
    .from('users')
    .select('id, status')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (existing) {
    // Ensure onboarding_progress exists even for returning OAuth users
    await supabase
      .from('onboarding_progress')
      .upsert({ user_id: existing.id, step: 0 }, { onConflict: 'user_id' })
    return { success: true, isNewUser: false }
  }

  const meta = user.user_metadata
  const fullName = meta?.full_name || meta?.name || ''

  const { data: newProfile } = await supabase
    .from('users')
    .insert({
      auth_id: user.id,
      email: user.email ? user.email.toLowerCase() : null,
      display_name: fullName || 'Spup User',
      username: `user_${user.id.slice(0, 8)}`,
      role: 'user',
      status: 'active',
    })
    .select('id')
    .single()

  if (newProfile) {
    await supabase
      .from('onboarding_progress')
      .upsert({ user_id: newProfile.id, step: 0 }, { onConflict: 'user_id' })
  }

  return { success: true, isNewUser: true }
}

// ─── Complete social profile ──────────────────────────────────────────────────

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

// ─── Onboarding step 1: username ──────────────────────────────────────────────

export async function checkUsernameAvailableAction(username: string) {
  if (!username || username.length < 3) return { available: false }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const query = supabase
    .from('users')
    .select('id')
    .eq('username', username.toLowerCase())

  if (user) query.neq('auth_id', user.id)

  const { data } = await query.maybeSingle()
  return { available: !data }
}

export async function saveUsernameAction(username: string) {
  if (!username || username.length < 3) return { error: 'Username must be at least 3 characters.' }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return { error: 'Letters, numbers and underscores only.' }
  if (username.length > 20) return { error: 'Username must be 20 characters or less.' }

  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: taken } = await supabase
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

  const profileId = await getProfileId(supabase, user.id)
  if (profileId) {
    await upsertOnboardingProgress(supabase, profileId, { step: 1 })
  }

  return { success: true }
}

// ─── Onboarding step 2: avatar ────────────────────────────────────────────────

export async function saveAvatarAction(avatarUrl: string) {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('users')
    .update({ avatar_url: avatarUrl })
    .eq('auth_id', user.id)

  if (error) return { error: 'Failed to save avatar.' }

  const profileId = await getProfileId(supabase, user.id)
  if (profileId) {
    await upsertOnboardingProgress(supabase, profileId, { step: 2 })
  }

  return { success: true }
}

// ─── Onboarding step 3: bio ───────────────────────────────────────────────────

export async function saveBioAction(bio: string) {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('users')
    .update({ bio: bio.trim() || null })
    .eq('auth_id', user.id)

  if (error) return { error: 'Failed to save bio.' }

  const profileId = await getProfileId(supabase, user.id)
  if (profileId) {
    await upsertOnboardingProgress(supabase, profileId, { profile_complete: true, step: 3 })
  }

  return { success: true }
}

// ─── Onboarding step 4: interests ────────────────────────────────────────────

export async function saveInterestsAction(data: InterestsSchema) {
  const parsed = interestsSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const profileId = await getProfileId(supabase, user.id)
  if (!profileId) return { error: 'Profile not found. Please try signing out and back in.' }

  // Delete existing then re-insert
  await supabase.from('user_interests').delete().eq('user_id', profileId)

  const { error: insertError } = await supabase
    .from('user_interests')
    .insert(parsed.data.interests.map(interest => ({ user_id: profileId, interest })))

  if (insertError) {
    console.error('saveInterestsAction insert error:', insertError.message)
    return { error: 'Failed to save interests. Please try again.' }
  }

  await upsertOnboardingProgress(supabase, profileId, { interests_set: true, step: 4 })

  return { success: true }
}

// ─── Onboarding step 5: complete ─────────────────────────────────────────────

export async function completeOnboardingAction() {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const profileId = await getProfileId(supabase, user.id)
  if (!profileId) return { error: 'Profile not found.' }

  await upsertOnboardingProgress(supabase, profileId, {
    first_follow: true,
    completed_at: new Date().toISOString(),
  })

  revalidatePath('/', 'layout')
  return { success: true }
}

// ─── Legacy: saveProfileAction ────────────────────────────────────────────────

export async function saveProfileAction(data: ProfileSetupSchema) {
  const parsed = profileSetupSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: taken } = await supabase
    .from('users').select('id')
    .eq('username', parsed.data.username)
    .neq('auth_id', user.id)
    .maybeSingle()

  if (taken) return { error: 'That username is already taken.' }

  const { error } = await supabase
    .from('users')
    .update({ username: parsed.data.username, bio: parsed.data.bio || null })
    .eq('auth_id', user.id)

  if (error) return { error: 'Failed to save profile.' }

  const profileId = await getProfileId(supabase, user.id)
  if (profileId) {
    await upsertOnboardingProgress(supabase, profileId, { profile_complete: true, step: 1 })
  }

  return { success: true }
}