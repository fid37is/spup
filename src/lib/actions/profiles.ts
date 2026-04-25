'use server'

/**
 * profiles.ts — mutations on the users table post-onboarding.
 * Onboarding-specific updates (saveProfile, saveInterests) stay in auth.ts
 * because they're tightly coupled to the auth flow.
 * Everything here is for the logged-in settings / edit-profile flow.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, profile: null }
  const { data: profile } = await supabase.from('users').select('id, auth_id').eq('auth_id', user.id).single()
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

// ─── Update avatar / banner URL (after Cloudinary upload) ────────────────────

export async function updateAvatarAction(avatarUrl: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  await supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', profile.id)
  revalidatePath('/profile')
  return { success: true }
}

export async function updateBannerAction(bannerUrl: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  await supabase.from('users').update({ banner_url: bannerUrl }).eq('id', profile.id)
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

  await supabase.from('users').update({ username: parsed.data }).eq('id', profile.id)
  revalidatePath('/profile')
  return { success: true }
}

// ─── Soft-delete account ──────────────────────────────────────────────────────

export async function deleteAccountAction() {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  // Soft-delete: set deleted_at, anonymise PII
  await supabase.from('users').update({
    deleted_at: new Date().toISOString(),
    display_name: 'Deleted user',
    bio: null,
    avatar_url: null,
    phone_number: null,
    email: null,
  }).eq('id', profile.id)

  await supabase.auth.signOut()
  return { success: true }
}