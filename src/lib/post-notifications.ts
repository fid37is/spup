// src/lib/post-notifications.ts
//
// Notification fan-out that happens when a post becomes visible:
//   - "new post" alerts for people who turned the author's bell on
//   - @mention notifications (+ email)
//
// Deliberately NOT a 'use server' file: these are internal helpers and must
// not be callable from the browser as server actions. They are used by
// lib/actions/posts.ts (immediate posts) and by the scheduled-post cron
// (posts that go live later).

import { createAdminClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { sendNotificationEmail } from '@/lib/email/send'
import { extractMentionedUsernames } from '@/lib/utils'

// Fan-out for "post notifications": one `new_post` notification per subscriber.
// Goes through createNotification, so each subscriber's Preferences (New posts),
// mutes/blocks and the push switch are all respected.
export async function notifyPostSubscribers(postId: string, authorId: string) {
  const admin = createAdminClient()
  const { data: subs, error } = await admin
    .from('post_notification_subscriptions')
    .select('user_id')
    .match({ target_user_id: authorId, type: 'post' })
  if (error) { console.error('notifyPostSubscribers: lookup failed', error.message); return }
  if (!subs?.length) return

  await Promise.all(subs.map(sub =>
    createNotification({
      recipientId: sub.user_id, actorId: authorId,
      type: 'new_post', entityId: postId, entityType: 'post',
    })
  ))
}

// Resolves @username mentions in a post body to real users, notifies each
// one (in-app + push, via createNotification) and, where the recipient hasn't
// opted out (notif_email), emails them too.
//
// If the post is a reply or a quote, its parent/quoted author already gets a
// reply/quote notification - so they are NOT also sent an in-app "mentioned
// you" for the same post (that used to produce two notifications for one
// reply). Their email is unaffected.
export async function notifyMentions(
  body: string, postId: string, actorId: string, actorUsername: string | null, actorDisplayName: string
) {
  const usernames = extractMentionedUsernames(body)
  if (usernames.length === 0) return

  const admin = createAdminClient()
  const { data: mentioned } = await admin
    .from('users')
    .select('id, username, email, notif_email')
    .in('username', usernames)
    .is('deleted_at', null)

  if (!mentioned || mentioned.length === 0) return

  // Who is already being notified about this post as a reply/quote target?
  const alreadyNotified = new Set<string>()
  const { data: thisPost } = await admin
    .from('posts').select('parent_post_id, quoted_post_id').eq('id', postId).maybeSingle()
  const relatedIds = [thisPost?.parent_post_id, thisPost?.quoted_post_id].filter(Boolean) as string[]
  if (relatedIds.length) {
    const { data: related } = await admin.from('posts').select('user_id').in('id', relatedIds)
    for (const r of related || []) alreadyNotified.add(r.user_id)
  }

  await Promise.all(mentioned.map(async user => {
    if (user.id === actorId) return // don't notify yourself for @your_own_username

    if (!alreadyNotified.has(user.id)) {
      await createNotification({ recipientId: user.id, actorId, type: 'mention', entityId: postId, entityType: 'post' })
    }

    if (user.email && user.notif_email !== false) {
      const result = await sendNotificationEmail({
        to: user.email,
        type: 'mention',
        data: {
          mentionerName: actorDisplayName,
          mentionerUsername: actorUsername || '',
          postPreview: body.trim(),
          postId,
        },
      })
      if (result.error) console.error(`mention email failed for ${user.email}:`, result.error)
    }
  }))
}

// ─── Scheduled posts ─────────────────────────────────────────────────────────
// A scheduled post is inserted with a future created_at. Its notifications must
// wait until it is live, and nothing else revisits the row - so it is put on a
// to-do list (pending_post_notifications) that the cron drains.

export async function queuePostNotifications(postId: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('pending_post_notifications').insert({ post_id: postId })
  // Missing table = migration 029 not run yet; the post itself is unaffected.
  if (error) console.error('queuePostNotifications failed:', error.message)
}

/** Send notifications for every scheduled post that has gone live. Idempotent. */
export async function processDueScheduledPosts(): Promise<{ sent: number; skipped: number }> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: pending, error } = await admin
    .from('pending_post_notifications')
    .select('post_id')
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) throw new Error(error.message)
  if (!pending?.length) return { sent: 0, skipped: 0 }

  const { data: posts } = await admin
    .from('posts')
    .select('id, body, user_id, created_at, deleted_at, author:users!posts_user_id_fkey(username, display_name)')
    .in('id', pending.map(p => p.post_id))

  const byId = new Map((posts || []).map((p: any) => [p.id, p]))
  let sent = 0, skipped = 0

  for (const { post_id } of pending) {
    const post: any = byId.get(post_id)

    // Gone (cancelled / deleted): nothing to send, drop from the list.
    if (!post || post.deleted_at) {
      await admin.from('pending_post_notifications').delete().eq('post_id', post_id)
      skipped++
      continue
    }
    // Not live yet - leave it queued.
    if (post.created_at > now) continue

    // Claim the row first so overlapping cron runs can't double-send.
    const { data: claimed } = await admin
      .from('pending_post_notifications').delete().eq('post_id', post_id).select('post_id')
    if (!claimed?.length) continue

    const author = Array.isArray(post.author) ? post.author[0] : post.author
    try {
      if (post.body?.trim()) {
        await notifyMentions(post.body.trim(), post.id, post.user_id, author?.username ?? null, author?.display_name ?? '')
      }
      await notifyPostSubscribers(post.id, post.user_id)
      sent++
    } catch (e) {
      console.error(`scheduled post notifications failed for ${post.id}:`, e)
    }
  }

  return { sent, skipped }
}