// src/lib/actions/auth.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

// ─── Email signup ─────────────────────────────────────────────────────────────
// Creates auth user with email + password. Supabase sends a 6-digit OTP to email.
// "Confirm email" must be ON in Supabase Auth settings, with OTP (not magic link).

export async function signUpAction(data: SignupSchema) {
  const parsed = signupSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { full_name, email, date_of_birth, password } = parsed.data
  const supabase = await createClient()

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name,
        date_of_birth,
        // username generated in onboarding
      },
      // Setting emailRedirectTo to undefined forces Supabase to use OTP mode
      // (requires "Email OTP" enabled in Supabase Auth > Email settings)
      emailRedirectTo: undefined,
    },
  })

  if (authError) {
    if (authError.message.includes('already registered') || authError.message.includes('User already registered')) {
      return { error: 'An account with this email already exists.' }
    }
    return { error: authError.message }
  }

  if (!authData.user) return { error: 'Signup failed. Please try again.' }

  // Create profile row immediately (unverified state)
  // Username is set during onboarding after email verification
  await supabase.from('users').insert({
    auth_id: authData.user.id,
    email,
    display_name: full_name,
    username: `user_${authData.user.id.slice(0, 8)}`, // temp username, updated in onboarding
    role: 'user',
    status: 'pending_verification',
  })

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

  // Activate account
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await supabase
      .from('users')
      .update({ status: 'active' })
      .eq('auth_id', user.id)
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

// ─── Resend email OTP ─────────────────────────────────────────────────────────

export async function resendEmailOtpAction(email: string) {
  const supabase = await createClient()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
  })
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
    if (error.message.includes('Invalid login') || error.message.includes('Email not confirmed')) {
      return { error: 'Wrong email or password. Please try again.' }
    }
    if (error.message.includes('Email not confirmed')) {
      return { error: 'Please verify your email first.', needsVerification: true, email: parsed.data.email }
    }
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

// ─── OAuth (Google / Facebook) ────────────────────────────────────────────────
// Client-side only — this just returns the URL, the redirect happens in the browser

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

// ─── OAuth callback — create profile if first time ───────────────────────────
// Called from app/api/auth/callback/route.ts after OAuth redirect

export async function handleOAuthCallbackAction() {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'No user session' }

  // Check if profile already exists
  const { data: existing } = await supabase
    .from('users')
    .select('id, status')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (existing) return { success: true, isNewUser: false }

  // New OAuth user — create minimal profile, redirect to complete profile
  const meta = user.user_metadata
  const fullName = meta?.full_name || meta?.name || ''

  await supabase.from('users').insert({
    auth_id: user.id,
    email: user.email || null,
    display_name: fullName || 'Spup User',
    username: `user_${user.id.slice(0, 8)}`, // temp
    role: 'user',
    status: 'active', // OAuth users are already verified by the provider
  })

  return { success: true, isNewUser: true }
}

// ─── Complete social profile (DoB + name after OAuth) ─────────────────────────

export async function completeSocialProfileAction(data: CompleteSocialProfileSchema) {
  const parsed = completeSocialProfileSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  await supabase
    .from('users')
    .update({ display_name: parsed.data.full_name })
    .eq('auth_id', user.id)

  // Store DoB in auth metadata (not in public users table for privacy)
  await supabase.auth.updateUser({
    data: { date_of_birth: parsed.data.date_of_birth },
  })

  return { success: true }
}

// ─── Onboarding steps ─────────────────────────────────────────────────────────

export async function saveProfileAction(data: ProfileSetupSchema) {
  const parsed = profileSetupSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: taken } = await supabase
    .from('users').select('id').eq('username', parsed.data.username).neq('auth_id', user.id).maybeSingle()
  if (taken) return { error: 'That username is already taken.' }

  const { error } = await supabase
    .from('users')
    .update({ username: parsed.data.username, bio: parsed.data.bio || null })
    .eq('auth_id', user.id)
  if (error) return { error: 'Failed to save profile.' }

  const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
  if (profile) {
    await supabase.from('onboarding_progress').update({ profile_complete: true, step: 1 }).eq('user_id', profile.id)
  }
  return { success: true }
}

export async function saveInterestsAction(data: InterestsSchema) {
  const parsed = interestsSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return { error: 'Profile not found' }

  await supabase.from('user_interests').delete().eq('user_id', profile.id)
  await supabase.from('user_interests').insert(parsed.data.interests.map(interest => ({ user_id: profile.id, interest })))
  await supabase.from('onboarding_progress').update({ interests_set: true, step: 2 }).eq('user_id', profile.id)
  return { success: true }
}

export async function completeOnboardingAction() {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return { error: 'Profile not found' }
  await supabase.from('onboarding_progress').update({ first_follow: true, completed_at: new Date().toISOString() }).eq('user_id', profile.id)
  revalidatePath('/', 'layout')
  return { success: true }
}