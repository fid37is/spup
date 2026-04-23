/**
 * queries/notifications.ts
 * ------------------------
 * Read queries for the notifications table.
 * Mutations (mark-read, delete) live in actions/notifications.ts.
 */

import { createClient } from '@/lib/supabase'

const NOTIF_SELECT = `
  id, type, entity_id, entity_type, metadata, is_read, created_at,
  actor:users!notifications_actor_id_fkey(
    id, username, display_name, avatar_url, verification_tier
  )
`

// ─── Paginated notifications ──────────────────────────────────────────────────

export async function getNotifications(userId: string, limit = 30, cursor?: string) {
  const supabase = await createClient()

  let query = supabase
    .from('notifications')
    .select(NOTIF_SELECT)
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (cursor) query = query.lt('created_at', cursor)

  const { data } = await query
  if (!data?.length) return { notifications: [], nextCursor: null }

  const hasMore = data.length > limit
  const page = hasMore ? data.slice(0, limit) : data
  const nextCursor = hasMore ? page[page.length - 1].created_at : null

  return { notifications: page, nextCursor }
}

// ─── Unread count (for badge) ─────────────────────────────────────────────────

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('is_read', false)

  return count || 0
}
