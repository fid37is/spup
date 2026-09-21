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
    tip_received: `${name} sent you a tip`,
    subscription_new: `${name} subscribed to you`,
    earning_milestone: 'You hit an earnings milestone',
    monetisation_approved: "You're approved for monetisation",
    system: 'Spup',
    new_message: `${name} sent you a message`,
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

/**
 * Creates an in-app notification and (best-effort, non-blocking on
 * failure) sends a push to every device the recipient has registered.
 */
export async function createNotification({
  recipientId,
  actorId,
  type,
  entityId,
  entityType = 'post',
  metadata = {},
  dedupeUnread = false,
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
}) {
  const admin = createAdminClient()

  // Don't notify yourself about your own action (e.g. liking your own post).
  if (actorId === recipientId) return

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

  if (!skipInsert) {
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

  // Fire-and-forget - a push failure should never affect the caller, which
  // is why sendPushToUser itself never throws.
  void sendPushToUser(recipientId, buildPushPayload(type, actorName, entityId))
}
