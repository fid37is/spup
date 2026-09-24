// src/lib/notifications.ts
//
// Every existing call site (escrow.ts's notify(), posts.ts's
// notifyPostAuthor(), etc.) only ever inserted a row into `notifications` -
// none of them triggered an actual push. This is the single place that
// does both, so it's the one to call going forward. Existing call sites
// haven't all been migrated to this yet (see PR notes / summary) - that's
// a larger follow-up than this change, but new notification code should
// use this rather than adding another local duplicate.

import { createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser, type PushPayload } from '@/lib/push/send'
import type { NotificationType } from '@/types'
import {
  DEFAULT_NOTIFICATION_SETTINGS, TYPE_TO_PREF, SOCIAL_TYPES, NEW_ACCOUNT_DAYS,
  type NotificationSettings,
} from '@/lib/notification-settings'

// Builds the push title/body for a notification type. Kept here (not in
// lib/push/send.ts) since it's about notification *content*, not delivery.
function buildPushPayload(type: NotificationType, actorName: string | null, entityId?: string): PushPayload {
  const name = actorName || 'Someone'
  const copy: Record<NotificationType, string> = {
    new_follower: `${name} started following you`,
    post_like: `${name} liked your post`,
    post_comment: `${name} commented on your post`,
    post_repost: `${name} reposted your post`,
    post_quote: `${name} quoted your post`,
    comment_like: `${name} liked your comment`,
    mention: `${name} mentioned you`,
    new_post: `${name} just posted`,
    tip_received: `${name} sent you a tip`,
    subscription_new: `${name} subscribed to you`,
    earning_milestone: 'You hit an earnings milestone',
    monetisation_approved: "You're approved for monetisation",
    system: 'Spup',
    new_message: `${name} sent you a message`,
    wallet_transfer_received: `${name} sent you money`,
    escrow_hold_received: `${name} paid for your item - funds are held in escrow`,
    escrow_delivered: `${name} marked your order as delivered`,
    escrow_released: 'Escrow funds have been released to you',
    escrow_disputed: `${name} opened a dispute on your order`,
    escrow_proposal: `${name} proposed a resolution`,
    escrow_escalated: 'Your dispute was escalated to Spup support',
  }

  return {
    title: 'Spup',
    body: copy[type] || `${name} sent you a notification`,
    type,
    entityId,
    actorUsername: actorName || undefined,
  }
}

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Decides whether a notification should be delivered to `recipientId`,
 * based on the recipient's Preferences (per-type switches), Filters
 * (who they don't want to hear from) and mutes/blocks. Also reports
 * whether a push is allowed (the master "Push notifications" switch).
 *
 * Fails OPEN: if settings can't be read (e.g. migration 028 hasn't been run
 * yet) the notification is delivered as before rather than silently lost.
 */
async function resolveDelivery(
  admin: AdminClient,
  recipientId: string,
  actorId: string | null,
  type: NotificationType,
): Promise<{ deliver: boolean; push: boolean }> {
  let settings: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS }
  let push = true

  try {
    const [{ data: row }, { data: recipient }] = await Promise.all([
      admin.from('notification_settings').select('*').eq('user_id', recipientId).maybeSingle(),
      admin.from('users').select('notif_push').eq('id', recipientId).maybeSingle(),
    ])
    if (row) settings = { ...settings, ...row }
    if (recipient && recipient.notif_push === false) push = false
  } catch { /* fail open */ }

  // 1. Per-type preference
  const prefKey = TYPE_TO_PREF[type]
  if (prefKey && settings[prefKey] === false) return { deliver: false, push }

  if (!actorId) return { deliver: true, push }

  try {
    // 2. Mutes / blocks (either direction for blocks)
    const [{ data: muted }, { data: blocked }] = await Promise.all([
      admin.from('user_mutes').select('muter_id').match({ muter_id: recipientId, muted_id: actorId }).maybeSingle(),
      admin.from('user_blocks').select('blocker_id')
        .or(`and(blocker_id.eq.${recipientId},blocked_id.eq.${actorId}),and(blocker_id.eq.${actorId},blocked_id.eq.${recipientId})`)
        .limit(1),
    ])
    if (muted || (blocked && blocked.length > 0)) return { deliver: false, push }

    // 3. Filters - social activity only
    if (SOCIAL_TYPES.has(type)) {
      const { filter_not_following, filter_not_following_you, filter_new_accounts, filter_default_avatar } = settings

      if (filter_not_following || filter_not_following_you) {
        const { data: rels } = await admin
          .from('follows')
          .select('follower_id, following_id')
          .or(`and(follower_id.eq.${recipientId},following_id.eq.${actorId}),and(follower_id.eq.${actorId},following_id.eq.${recipientId})`)
        const iFollow = (rels || []).some(r => r.follower_id === recipientId)
        const followsMe = (rels || []).some(r => r.follower_id === actorId)
        if (filter_not_following && !iFollow) return { deliver: false, push }
        if (filter_not_following_you && !followsMe) return { deliver: false, push }
      }

      if (filter_new_accounts || filter_default_avatar) {
        const { data: actor } = await admin
          .from('users').select('created_at, avatar_url').eq('id', actorId).maybeSingle()
        if (actor) {
          const ageDays = (Date.now() - new Date(actor.created_at).getTime()) / 86_400_000
          if (filter_new_accounts && ageDays < NEW_ACCOUNT_DAYS) return { deliver: false, push }
          if (filter_default_avatar && !actor.avatar_url) return { deliver: false, push }
        }
      }
    }
  } catch { /* fail open */ }

  return { deliver: true, push }
}

/**
 * Creates an in-app notification and (best-effort, non-blocking on
 * failure) sends a push to every device the recipient has registered.
 * Respects the recipient's notification Preferences and Filters.
 */
export async function createNotification({
  recipientId,
  actorId,
  type,
  entityId,
  entityType = 'post',
  metadata = {},
  dedupeUnread = false,
  inApp = true,
}: {
  recipientId: string
  actorId: string | null
  type: NotificationType
  entityId?: string
  entityType?: string
  metadata?: Record<string, unknown>
  /**
   * Skip the in-app row if the recipient already has an UNREAD notification of
   * the same type for the same entity (still sends the push). For chat: ten
   * messages in a row are one "sent you a message" alert, not ten - and they
   * no longer inflate the Alerts badge.
   */
  dedupeUnread?: boolean
  /**
   * false = push only, no row in the notifications table (so nothing appears
   * on the Notifications page or its badge). Used for chat messages, which are
   * surfaced on the Messages icon instead.
   */
  inApp?: boolean
}) {
  const admin = createAdminClient()

  // Don't notify yourself about your own action (e.g. liking your own post).
  if (actorId === recipientId) return

  const delivery = await resolveDelivery(admin, recipientId, actorId, type)
  if (!delivery.deliver) return

  let skipInsert = false
  if (dedupeUnread && entityId) {
    const { data: existing } = await admin
      .from('notifications')
      .select('id')
      .eq('recipient_id', recipientId)
      .eq('type', type)
      .eq('entity_id', entityId)
      .eq('is_read', false)
      .limit(1)
    skipInsert = !!existing && existing.length > 0
  }

  if (inApp && !skipInsert) {
    const { error } = await admin.from('notifications').insert({
      recipient_id: recipientId,
      actor_id: actorId,
      type,
      entity_id: entityId ?? null,
      entity_type: entityType,
      metadata,
    })

    if (error) {
      console.error('createNotification: insert failed', error)
      return
    }
  }

  let actorName: string | null = null
  if (actorId) {
    const { data: actor } = await admin.from('users').select('username').eq('id', actorId).single()
    actorName = actor?.username ? `@${actor.username}` : null
  }

  // Master "Push notifications" switch (Notification settings > Preferences).
  if (!delivery.push) return

  // A reply's push should open the reply itself, not the post it replied to.
  const pushEntityId = (metadata as { reply_id?: string })?.reply_id ?? entityId

  // Fire-and-forget - a push failure should never affect the caller, which
  // is why sendPushToUser itself never throws.
  void sendPushToUser(recipientId, buildPushPayload(type, actorName, pushEntityId))
}
