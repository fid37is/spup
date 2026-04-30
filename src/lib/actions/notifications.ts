'use server'

/**
 * notifications.ts — mark-read, mark-all-read, delete.
 * Creating notifications is a side-effect done inside posts/follows actions,
 * not triggered by the user directly.
 */

import { createClient } from '@/lib/supabase/server'

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, profile: null }
  const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
  return { supabase, profile }
}

// ─── Mark one notification as read ───────────────────────────────────────────

export async function markNotificationReadAction(notificationId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  await supabase
    .from('notifications')
    .update({ is_read: true })
    .match({ id: notificationId, recipient_id: profile.id }) // RLS + match prevents cross-user writes

  return { success: true }
}

// ─── Mark all notifications as read ──────────────────────────────────────────

export async function markAllNotificationsReadAction() {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', profile.id)
    .eq('is_read', false)

  return { success: true }
}

// ─── Delete a single notification ────────────────────────────────────────────

export async function deleteNotificationAction(notificationId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  await supabase
    .from('notifications')
    .delete()
    .match({ id: notificationId, recipient_id: profile.id })

  return { success: true }
}
// ─── Client-callable paginated fetch (for infinite scroll) ────────────────────

export async function getNotificationsAction(cursor?: string, limit = 30) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { notifications: [], nextCursor: null }

  let query = supabase
    .from('notifications')
    .select(`
      id, type, entity_id, entity_type, metadata, is_read, created_at,
      actor:users!notifications_actor_id_fkey(id, username, display_name, avatar_url, verification_tier)
    `)
    .eq('recipient_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (cursor) query = query.lt('created_at', cursor)

  const { data } = await query
  if (!data?.length) return { notifications: [], nextCursor: null }

  const hasMore = data.length > limit
  const page = hasMore ? data.slice(0, limit) : data
  return { notifications: page, nextCursor: hasMore ? page[page.length - 1].created_at : null }
}