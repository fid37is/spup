'use server'

/**
 * notification-settings.ts - read/write the viewer's notification Filters and
 * Preferences, and manage who they get post notifications from.
 * (Enforcement happens in lib/notifications.ts -> createNotification.)
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  DEFAULT_NOTIFICATION_SETTINGS, NOTIFICATION_SETTING_KEYS,
  type NotificationSettings,
} from '@/lib/notification-settings'

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, profile: null }
  const { data: profile } = await supabase
    .from('users').select('id, username').eq('auth_id', user.id).single()
  return { supabase, profile }
}

export async function getNotificationSettingsAction(): Promise<NotificationSettings> {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { ...DEFAULT_NOTIFICATION_SETTINGS }

  const { data } = await supabase
    .from('notification_settings').select('*').eq('user_id', profile.id).maybeSingle()

  const merged = { ...DEFAULT_NOTIFICATION_SETTINGS }
  for (const key of NOTIFICATION_SETTING_KEYS) {
    if (data && typeof data[key] === 'boolean') merged[key] = data[key]
  }
  return merged
}

/** Update one or more switches. Unknown keys / non-booleans are ignored. */
export async function updateNotificationSettingsAction(patch: Partial<NotificationSettings>) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  const clean: Record<string, boolean> = {}
  for (const key of NOTIFICATION_SETTING_KEYS) {
    if (typeof patch[key] === 'boolean') clean[key] = patch[key] as boolean
  }
  if (Object.keys(clean).length === 0) return { success: true }

  const { error } = await supabase
    .from('notification_settings')
    .upsert(
      { user_id: profile.id, ...clean, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )

  if (error) {
    console.error('updateNotificationSettingsAction:', error.code, error.message)
    // 42P01 = table missing; PGRST205 = PostgREST can't see it.
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return { error: "Notification settings aren't available yet. Please try again later." }
    }
    return { error: 'Could not save. Please try again.' }
  }

  revalidatePath('/notifications/settings', 'layout')
  return { success: true }
}

// ─── People you get post notifications from ──────────────────────────────────

export interface PostNotificationTarget {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  verification_tier: string
}

export async function getPostNotificationTargetsAction(): Promise<PostNotificationTarget[]> {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return []

  // Two plain queries rather than an embedded join, so this doesn't depend on
  // the foreign-key constraint's generated name.
  const { data: prefs } = await supabase
    .from('user_notification_preferences')
    .select('target_user_id, created_at')
    .match({ user_id: profile.id, type: 'post' })
    .order('created_at', { ascending: false })

  const ids = (prefs || []).map((p: any) => p.target_user_id)
  if (!ids.length) return []

  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, verification_tier')
    .in('id', ids)
    .is('deleted_at', null)

  const byId = new Map((users || []).map((u: any) => [u.id, u as PostNotificationTarget]))
  return ids.map((id: string) => byId.get(id)).filter(Boolean) as PostNotificationTarget[]
}

/** Idempotent "off" (togglePostNotificationsAction flips; this only removes). */
export async function disablePostNotificationsAction(targetUserId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('user_notification_preferences')
    .delete()
    .match({ user_id: profile.id, target_user_id: targetUserId, type: 'post' })

  if (error) return { error: 'Could not turn off post notifications.' }
  revalidatePath('/notifications', 'layout')
  return { success: true }
}