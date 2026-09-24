'use server'

/**
 * notifications.ts - read + mutate the notifications table.
 * Creating notifications is a side-effect done inside posts/follows actions
 * (see lib/notifications.ts), not triggered by the user directly.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getPostsByIdsAction, type FeedPost } from '@/lib/actions/feed'
import { MENTION_TYPES, NEW_POST_WINDOW_HOURS } from '@/lib/notification-settings'

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, profile: null }
  const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
  return { supabase, profile }
}

// ─── Shapes ──────────────────────────────────────────────────────────────────

export type NotificationTab = 'all' | 'priority' | 'mentions'

export interface NotificationActor {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  verification_tier: string
}

/** Just enough of a post to render a snippet under a notification. */
export interface NotificationPostPreview {
  id: string
  body: string | null
  is_reply: boolean
  media_thumb: string | null
  media_type: string | null
  likes_count: number
  comments_count: number
  reposts_count: number
}

export interface NotificationItem {
  id: string
  type: string
  entity_id: string | null
  entity_type: string | null
  metadata: Record<string, any>
  is_read: boolean
  created_at: string
  actor: NotificationActor | null
  /** The post the notification is about (the entity). */
  post: NotificationPostPreview | null
  /** For replies: the reply itself (metadata.reply_id). */
  reply: NotificationPostPreview | null
}

export interface NewPostUser extends NotificationActor {
  count: number
  unread: number
  latest_at: string
}

const NOTIF_SELECT = `
  id, type, entity_id, entity_type, metadata, is_read, created_at,
  actor:users!notifications_actor_id_fkey(id, username, display_name, avatar_url, verification_tier)
`

const one = <T,>(v: T[] | T | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

// ─── Mark read / delete ──────────────────────────────────────────────────────

export async function markNotificationReadAction(notificationId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  await supabase
    .from('notifications')
    .update({ is_read: true })
    .match({ id: notificationId, recipient_id: profile.id }) // RLS + match prevents cross-user writes

  // Keeps the sidebar / bottom-nav unread badge in step.
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function markAllNotificationsReadAction() {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', profile.id)
    .eq('is_read', false)

  revalidatePath('/', 'layout')
  return { success: true }
}

/** Mark several at once (a grouped "A, B and 3 others liked your post" row). */
export async function markNotificationsReadAction(ids: string[]) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!ids.length) return { success: true }

  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', profile.id)
    .in('id', ids.slice(0, 200))

  revalidatePath('/', 'layout')
  return { success: true }
}

export async function deleteNotificationAction(notificationId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  await supabase
    .from('notifications')
    .delete()
    .match({ id: notificationId, recipient_id: profile.id })

  revalidatePath('/', 'layout')
  return { success: true }
}

// ─── Paginated list (All / Priority / Mentions) ──────────────────────────────

export async function getNotificationsAction(
  cursor?: string,
  limit = 30,
  tab: NotificationTab = 'all',
): Promise<{ notifications: NotificationItem[]; nextCursor: string | null }> {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { notifications: [], nextCursor: null }

  // Priority = everything from people you turned post notifications on for.
  let priorityIds: string[] | null = null
  if (tab === 'priority') {
    const { data: targets } = await supabase
      .from('user_notification_preferences')
      .select('target_user_id')
      .match({ user_id: profile.id, type: 'post' })
    priorityIds = (targets || []).map((t: any) => t.target_user_id)
    if (!priorityIds.length) return { notifications: [], nextCursor: null }
  }

  const windowStart = new Date(Date.now() - NEW_POST_WINDOW_HOURS * 3_600_000).toISOString()

  // `strict` adds the two filters that compare `type` against an enum value
  // ('new_message', 'new_post'). If the database enum is missing either value
  // (migration 028 / 033 not run yet) Postgres rejects the whole query, so the
  // retry below drops them and the same two rules are applied in JS instead.
  const build = (strict: boolean) => {
    let q = supabase
      .from('notifications')
      .select(NOTIF_SELECT)
      .eq('recipient_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(limit + 1)

    // messages only show on the Messages icon
    if (strict) q = q.neq('type', 'new_message')

    if (tab === 'mentions') {
      // Posts where you were replied to or @mentioned.
      q = q.in('type', MENTION_TYPES)
    } else {
      if (priorityIds) q = q.in('actor_id', priorityIds)
      // Fresh "new post" notifications are summarised by the pane at the top
      // of the page (getNewPostPaneAction) - don't also list them row by row.
      if (strict) q = q.or(`type.neq.new_post,created_at.lt.${windowStart}`)
    }
    if (cursor) q = q.lt('created_at', cursor)
    return q
  }

  let { data, error } = await build(true)
  if (error) {
    console.error('getNotificationsAction: query failed, retrying without type filters:', error.message)
    ;({ data, error } = await build(false))
    if (error) console.error('getNotificationsAction: retry failed:', error.message)
  }
  if (!data?.length) return { notifications: [], nextCursor: null }

  const hasMore = data.length > limit
  const rows = hasMore ? data.slice(0, limit) : data
  const nextCursor = hasMore ? rows[rows.length - 1].created_at : null

  // The two rules the strict query applies in SQL (a no-op when it ran).
  const windowStartMs = Date.parse(windowStart)
  const page = rows.filter((r: any) =>
    r.type !== 'new_message' &&
    !(r.type === 'new_post' && Date.parse(r.created_at) >= windowStartMs),
  )

  return { notifications: await hydrate(supabase, page), nextCursor }
}

// Attach the post (and reply) each notification is about so the client can
// show a snippet + thumbnail without a request per row.
async function hydrate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: any[],
): Promise<NotificationItem[]> {
  const postIds = new Set<string>()
  for (const r of rows) {
    if (r.entity_type === 'post' && r.entity_id) postIds.add(r.entity_id)
    if (r.metadata?.reply_id) postIds.add(r.metadata.reply_id)
  }

  const previews = new Map<string, NotificationPostPreview>()
  if (postIds.size) {
    const { data: posts } = await supabase
      .from('posts')
      .select('id, body, parent_post_id, likes_count, comments_count, reposts_count, media:post_media(media_type, url, thumbnail_url, position)')
      .in('id', [...postIds])
      .is('deleted_at', null)

    for (const p of posts || []) {
      const media = ([...((p as any).media || [])] as any[]).sort((a, b) => a.position - b.position)[0]
      previews.set(p.id, {
        id: p.id,
        body: p.body,
        is_reply: !!p.parent_post_id,
        media_thumb: media ? (media.thumbnail_url || (media.media_type === 'image' ? media.url : null)) : null,
        media_type: media?.media_type ?? null,
        likes_count: (p as any).likes_count ?? 0,
        comments_count: (p as any).comments_count ?? 0,
        reposts_count: (p as any).reposts_count ?? 0,
      })
    }
  }

  return rows.map(r => ({
    id: r.id,
    type: r.type,
    entity_id: r.entity_id,
    entity_type: r.entity_type,
    metadata: r.metadata ?? {},
    is_read: r.is_read,
    created_at: r.created_at,
    actor: one<NotificationActor>(r.actor),
    post: r.entity_type === 'post' && r.entity_id ? (previews.get(r.entity_id) ?? null) : null,
    reply: r.metadata?.reply_id ? (previews.get(r.metadata.reply_id) ?? null) : null,
  }))
}

// ─── "New posts" pane ────────────────────────────────────────────────────────
// People whose post notifications you turned on and who have posted in the
// last NEW_POST_WINDOW_HOURS. One entry per person, most recent first.

interface NewPostRow {
  notificationId: string
  postId: string
  isRead: boolean
  createdAt: string
  actor: NotificationActor
}

async function loadNewPostRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
): Promise<NewPostRow[]> {
  const since = new Date(Date.now() - NEW_POST_WINDOW_HOURS * 3_600_000).toISOString()

  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIF_SELECT)
    .eq('recipient_id', profileId)
    .eq('type', 'new_post')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) console.error('loadNewPostRows: query failed:', error.message)
  if (!data?.length) return []

  // Drop notifications whose post has since been deleted.
  const postIds = data.map((r: any) => r.entity_id).filter(Boolean)
  const { data: alive } = await supabase
    .from('posts').select('id').in('id', postIds).is('deleted_at', null)
  const aliveSet = new Set((alive || []).map((p: any) => p.id))

  const rows: NewPostRow[] = []
  for (const r of data as any[]) {
    const actor = one<NotificationActor>(r.actor)
    if (!actor || !r.entity_id || !aliveSet.has(r.entity_id)) continue
    rows.push({
      notificationId: r.id, postId: r.entity_id,
      isRead: r.is_read, createdAt: r.created_at, actor,
    })
  }
  return rows
}

function groupByUser(rows: NewPostRow[]): NewPostUser[] {
  const map = new Map<string, NewPostUser>()
  for (const r of rows) {           // rows are newest-first
    const existing = map.get(r.actor.id)
    if (existing) {
      existing.count += 1
      if (!r.isRead) existing.unread += 1
    } else {
      map.set(r.actor.id, { ...r.actor, count: 1, unread: r.isRead ? 0 : 1, latest_at: r.createdAt })
    }
  }
  return [...map.values()]          // insertion order = most recent poster first
}

export async function getNewPostPaneAction(): Promise<{ users: NewPostUser[]; totalPosts: number; unread: number }> {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { users: [], totalPosts: 0, unread: 0 }

  const rows = await loadNewPostRows(supabase, profile.id)
  const users = groupByUser(rows)
  return {
    users,
    totalPosts: rows.length,
    unread: rows.filter(r => !r.isRead).length,
  }
}

/**
 * The posts behind the pane, rendered as real feed posts, in the order they
 * came in (newest first, same as the feed). Pass a username to see one
 * person's posts only.
 */
export async function getNewPostsFeedAction(username?: string): Promise<{
  posts: FeedPost[]
  users: NewPostUser[]
}> {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { posts: [], users: [] }

  const rows = await loadNewPostRows(supabase, profile.id)
  const users = groupByUser(rows)

  const wanted = username
    ? rows.filter(r => r.actor.username.toLowerCase() === username.toLowerCase())
    : rows

  const posts = await getPostsByIdsAction(wanted.map(r => r.postId))
  return { posts, users }
}

/** Opening the new-posts view counts as reading those notifications. */
export async function markNewPostsReadAction(actorId?: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  let q = supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', profile.id)
    .eq('type', 'new_post')
    .eq('is_read', false)
  if (actorId) q = q.eq('actor_id', actorId)
  await q

  revalidatePath('/', 'layout')
  return { success: true }
}