'use server'

/**
 * profiles.ts — mutations on the users table post-onboarding.
 * Onboarding-specific updates (saveProfile, saveInterests) stay in auth.ts
 * because they're tightly coupled to the auth flow.
 * Everything here is for the logged-in settings / edit-profile flow.
 */

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, profile: null }
  const { data: profile } = await supabase
    .from('users')
    .select('id, auth_id')
    .eq('auth_id', user.id)
    .single()
  return { supabase, profile }
}

// ─── Update profile fields ────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  display_name:        z.string().min(2).max(50).optional(),
  bio:                 z.string().max(160).optional(),
  location:            z.string().max(60).optional(),
  website_url:         z.string().url().optional().or(z.literal('')),
  language_preference: z.enum(['en', 'yo', 'ig', 'ha', 'pcm']).optional(),
  is_private:          z.boolean().optional(),
  notif_push:          z.boolean().optional(),
  notif_email:         z.boolean().optional(),
})

export type UpdateProfileData = z.infer<typeof updateProfileSchema>

export async function updateProfileAction(data: UpdateProfileData) {
  const parsed = updateProfileSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('users')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', profile.id)

  if (error) return { error: 'Failed to update profile.' }

  revalidatePath('/profile')
  revalidatePath('/settings')
  return { success: true }
}

// ─── Update avatar URL (after Cloudinary upload) ─────────────────────────────

export async function updateAvatarAction(avatarUrl: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('users')
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq('id', profile.id)

  if (error) return { error: 'Failed to save avatar.' }

  revalidatePath('/profile')
  revalidatePath('/', 'layout') // refreshes sidebar avatar too
  return { success: true }
}

// ─── Update banner/cover URL (after Cloudinary upload) ───────────────────────

export async function updateBannerAction(bannerUrl: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('users')
    .update({ banner_url: bannerUrl, updated_at: new Date().toISOString() })
    .eq('id', profile.id)

  if (error) return { error: 'Failed to save cover photo.' }

  revalidatePath('/profile')
  return { success: true }
}

// ─── Change username ──────────────────────────────────────────────────────────

export async function changeUsernameAction(newUsername: string) {
  const usernameSchema = z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/)
  const parsed = usernameSchema.safeParse(newUsername.toLowerCase())
  if (!parsed.success) return { error: 'Username must be 3–20 chars, letters/numbers/underscores only.' }

  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  const { data: taken } = await supabase
    .from('users').select('id')
    .eq('username', parsed.data)
    .neq('id', profile.id)
    .maybeSingle()

  if (taken) return { error: 'That username is already taken.' }

  const { error } = await supabase
    .from('users')
    .update({ username: parsed.data, updated_at: new Date().toISOString() })
    .eq('id', profile.id)

  if (error) return { error: 'Failed to update username.' }

  revalidatePath('/profile')
  return { success: true }
}

// ─── Change password ──────────────────────────────────────────────────────────
// Supabase updateUser works for the currently authenticated session —
// no need to re-supply the old password (user is already logged in).

export async function changePasswordAction(newPassword: string, confirmPassword: string) {
  if (newPassword !== confirmPassword) return { error: 'Passwords do not match.' }

  const passwordSchema = z.string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password too long.')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter.')
    .regex(/[0-9]/, 'Must contain at least one number.')

  const parsed = passwordSchema.safeParse(newPassword)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  const { error } = await supabase.auth.updateUser({ password: parsed.data })
  if (error) return { error: error.message }

  return { success: true }
}

// ─── Soft-delete account ──────────────────────────────────────────────────────
// Two-step: first anonymise all PII in the users table, then permanently
// delete the Supabase Auth record. Permanent deletion is required by:
//   • Apple App Store (guideline 5.1.1 — data must be fully deletable)
//   • Google Play (policy update June 2022 — account deletion required)
// The soft-delete of the users row keeps referential integrity for posts/
// notifications that were created before deletion (they show "Deleted user").

export async function deleteAccountAction() {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  const admin = createAdminClient()

  // 1. Anonymise all personally-identifiable data
  await admin.from('users').update({
    deleted_at:   new Date().toISOString(),
    display_name: 'Deleted user',
    bio:          null,
    avatar_url:   null,
    banner_url:   null,
    phone_number: null,
    email:        null,
    website_url:  null,
    location:     null,
    username:     `deleted_${profile.id.slice(0, 8)}`,
  }).eq('id', profile.id)

  // 2. Sign the session out first so the cookie is cleared
  await supabase.auth.signOut()

  // 3. Hard-delete the auth.users row — this is what the app stores require.
  //    After this the email/phone can be re-used for a new account.
  const { error: deleteError } = await admin.auth.admin.deleteUser(profile.auth_id)
  if (deleteError) {
    // Log but don't surface — the users row is already anonymised
    console.error('deleteAccountAction: auth deletion failed', deleteError.message)
  }

  return { success: true }
}