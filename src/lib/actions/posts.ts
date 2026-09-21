'use server'

/**
 * posts.ts - mutations that write to the posts table only.
 * Reads/queries live in lib/queries/posts.ts.
 */

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { sendNotificationEmail } from '@/lib/email/send'
import { createPostSchema, type CreatePostSchema } from '@/lib/validations/schemas'
import { extractMentionedUsernames } from '@/lib/utils'
import { getPostById } from '@/lib/queries/posts'
import type { SupabaseClient } from '@supabase/supabase-js'

// Fire-and-forget counter bump that still logs failures instead of swallowing
// them silently - see the identical helper in follows.ts for context.
function bumpCounter(supabase: SupabaseClient, table: string, column: string, id: string, amount: number) {
  void supabase.rpc('increment_counter', { p_table: table, p_column: column, p_id: id, p_amount: amount })
    .then(({ error }) => {
      if (error) console.error(`increment_counter failed (${table}.${column}, id=${id}):`, error.message)
    })
}

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, profile: null }
  const { data: profile } = await supabase.from('users').select('id, username, display_name, status').eq('auth_id', user.id).single()
  return { supabase, profile }
}

export async function createPostAction(data: CreatePostSchema) {
  const parsed = createPostSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (profile.status === 'suspended' || profile.status === 'banned') return { error: 'Your account is not eligible to post.' }
  const { body, parent_post_id, quoted_post_id, media, scheduled_at } = parsed.data

  // Uploads now go straight from the phone to Cloudinary, so this action no
  // longer sees the file - only the details the client reports back. Make sure
  // every item really is in *this* user's post folder on *our* Cloudinary
  // account, so a post can't be pointed at someone else's media or an
  // arbitrary URL. (Folder name matches /api/upload and /api/upload/signature.)
  if (media?.length) {
    const cloudBase = `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/`
    const folderPrefix = `para/${profile.id}/posts/`
    const invalid = media.some(m =>
      !m.cloudinary_id.startsWith(folderPrefix) ||
      !m.url.startsWith(cloudBase) ||
      (m.thumbnail_url && !m.thumbnail_url.startsWith(cloudBase))
    )
    if (invalid) return { error: 'Some media could not be verified. Please remove it and upload it again.' }
  }
  const postType = parent_post_id ? 'reply' : quoted_post_id ? 'quote' : 'original'
  const isScheduled = !!scheduled_at
  const { data: post, error } = await supabase
    .from('posts')
    .insert({
      user_id: profile.id,
      body: body?.trim() || '',
      post_type: postType,
      parent_post_id: parent_post_id || null,
      quoted_post_id: quoted_post_id || null,
      // Scheduling is just a future created_at - feed queries filter
      // created_at <= now() so the row simply doesn't appear anywhere
      // (including the author's own profile) until that moment arrives.
      // No cron job needed.
      ...(isScheduled ? { created_at: scheduled_at } : {}),
    })
    .select('id').single()
  if (error) return { error: 'Failed to post. Please try again.' }

  // Extract #hashtags from the body and link them via post_hashtags - this
  // is what powers interest-based feed personalisation, hashtag search, and
  // Explore's trending tab. The extraction itself (regex + upsert +
  // posts_count) already existed as a DB function from day one
  // (001_initial_schema.sql); nothing in the app ever called it, so
  // hashtags/post_hashtags stayed permanently empty and every feature
  // reading from them was silently a no-op. Fire-and-forget: a failure
  // here shouldn't block the post itself.
  if (body?.trim()) {
    void supabase.rpc('process_post_hashtags', { p_post_id: post.id, p_body: body })
      .then(({ error }) => { if (error) console.error('process_post_hashtags failed:', error.message) })
  }

  // Insert post_media rows now that we have a real post_id
  if (media?.length) {
    const { error: mediaError } = await supabase.from('post_media').insert(
      media.map((m, i) => ({
        post_id: post.id,
        media_type: m.media_type,
        url: m.url,
        thumbnail_url: m.thumbnail_url || null,
        width: m.width || null,
        height: m.height || null,
        duration_secs: m.duration_secs || null,
        size_bytes: m.size_bytes || null,
        position: i,
      }))
    )
    if (mediaError) {
      // Roll back the post so we don't leave an orphaned empty post
      await supabase.from('posts').delete().eq('id', post.id)
      return { error: 'Failed to attach media. Please try again.' }
    }
  }
  // Bumped immediately even for scheduled posts (no worker revisits this
  // row when it goes live to bump it then) - cancelScheduledPostAction
  // undoes this if the post is cancelled before it publishes.
  bumpCounter(supabase, 'users', 'posts_count', profile.id, 1)
  if (parent_post_id) {
    bumpCounter(supabase, 'posts', 'comments_count', parent_post_id, 1)
    void notifyPostAuthor(supabase, parent_post_id, profile.id, 'post_comment', { reply_id: post.id })
    revalidatePath(`/post/${parent_post_id}`)
  }
  if (quoted_post_id) {
    // This was previously never incremented at all - quote posts were being
    // created with no effect on the quoted post's quotes_count.
    bumpCounter(supabase, 'posts', 'quotes_count', quoted_post_id, 1)
    void notifyPostAuthor(supabase, quoted_post_id, profile.id, 'post_quote', { reply_id: post.id })
    revalidatePath(`/post/${quoted_post_id}`)
  }
  // Mentions notify their recipients immediately - that only makes sense
  // once the post is actually visible, so a scheduled post's @mentions wait
  // and fire for real when it goes live (see the note above the insert).
  if (body?.trim() && !isScheduled) {
    void notifyMentions(body.trim(), post.id, profile.id, profile.username, profile.display_name)
  }
  // Everyone who turned on post notifications (the bell on this author's
  // profile) gets a "new post" notification. Replies are excluded - those
  // notify the person being replied to instead. Scheduled posts skip this for
  // the same reason mentions do: nothing revisits them when they go live.
  if (!parent_post_id && !isScheduled) {
    void notifyPostSubscribers(post.id, profile.id)
  }
  revalidatePath('/feed')

  if (isScheduled) {
    return { success: true, postId: post.id, scheduled: true, scheduledFor: scheduled_at! }
  }

  // Return the fully-hydrated post (author, media, counts, created_at) so the
  // client can prepend it to the feed immediately with real data - returning
  // just the id left callers building a bare `{ id }` stub that rendered as
  // "Invalid Date" with no media until the next full page refresh.
  const hydrated = await getPostById(post.id)
  if (!hydrated) return { success: true, postId: post.id }

  return {
    success: true,
    postId: post.id,
    post: {
      ...hydrated,
      is_liked: false,
      is_reposted: false,
      is_bookmarked: false,
    },
  }
}

// ── Scheduled posts ──────────────────────────────────────────────────────────
// "Scheduled" just means: a post the caller owns whose created_at hasn't
// arrived yet. Powers the Drafts panel's Scheduled tab.

export async function getScheduledPostsAction() {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { posts: [] }
  const { data, error } = await supabase
    .from('posts')
    .select(`
      id, body, created_at, is_selling,
      media:post_media(id, media_type, url, thumbnail_url, width, height, position)
    `)
    .eq('user_id', profile.id)
    .is('deleted_at', null)
    .gt('created_at', new Date().toISOString())
    .order('created_at', { ascending: true })
  if (error) return { posts: [] }
  return { posts: data || [] }
}

export async function cancelScheduledPostAction(postId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  const { data: post } = await supabase
    .from('posts')
    .select('id, user_id, created_at')
    .eq('id', postId)
    .single()

  if (!post || post.user_id !== profile.id) return { error: 'Scheduled post not found' }
  if (new Date(post.created_at).getTime() <= Date.now()) {
    return { error: 'This post has already gone live and can\u2019t be cancelled' }
  }

  // Hard delete, not soft-delete - it was never actually published, so
  // there's nothing for the soft-delete tombstone to be useful for.
  const { error } = await supabase.from('posts').delete().eq('id', postId).eq('user_id', profile.id)
  if (error) return { error: 'Could not cancel scheduled post. Please try again.' }

  // createPostAction bumped posts_count on insert (see comment there) -
  // undo it now that the post is being cancelled instead of going live.
  bumpCounter(supabase, 'users', 'posts_count', profile.id, -1)
  revalidatePath('/feed')
  return { success: true }
}

export async function deletePostAction(postId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  // Fetch parent/quoted post ids before deleting - needed to decrement their
  // counts below. Without this, deleting a reply or quote left the parent's
  // comments_count / quotes_count permanently inflated.
  const { data: existingPost } = await supabase
    .from('posts')
    .select('parent_post_id, quoted_post_id, post_type')
    .eq('id', postId)
    .single()

  // Soft delete needs the service-role client: posts_public_read hides rows
  // where deleted_at IS NOT NULL, and Postgres also checks the NEW row of an
  // UPDATE against that SELECT policy, so a user-scoped client always gets
  // "new row violates row-level security policy". Ownership is still enforced
  // here by matching user_id from the verified session. `.is('deleted_at', null)`
  // + `.select()` make a repeat/no-op delete an error instead of a silent
  // success that would decrement the counters twice.
  const { data: deleted, error } = await createAdminClient()
    .from('posts')
    .update({ deleted_at: new Date().toISOString() })
    .match({ id: postId, user_id: profile.id })
    .is('deleted_at', null)
    .select('id')
  if (error || !deleted?.length) return { error: 'Could not delete post.' }
  bumpCounter(supabase, 'users', 'posts_count', profile.id, -1)

  if (existingPost?.parent_post_id) {
    bumpCounter(supabase, 'posts', 'comments_count', existingPost.parent_post_id, -1)
    revalidatePath(`/post/${existingPost.parent_post_id}`)
  }
  // quoted_post_id is used by both 'quote' and 'repost' post_types (a plain
  // repost points at the original via quoted_post_id with no body) - decrement
  // the correct counter for which one this actually was.
  if (existingPost?.quoted_post_id && existingPost.post_type === 'quote') {
    bumpCounter(supabase, 'posts', 'quotes_count', existingPost.quoted_post_id, -1)
    revalidatePath(`/post/${existingPost.quoted_post_id}`)
  }
  if (existingPost?.quoted_post_id && existingPost.post_type === 'repost') {
    // Covers deletion via this action (e.g. moderation) - toggleRepostAction
    // already handles its own decrement for the normal unrepost path.
    bumpCounter(supabase, 'posts', 'reposts_count', existingPost.quoted_post_id, -1)
  }

  revalidatePath('/feed')
  revalidatePath('/profile')
  return { success: true }
}

export async function toggleLikeAction(postId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  const { data: existing } = await supabase
    .from('likes').select('id')
    .match({ user_id: profile.id, post_id: postId })
    .maybeSingle()

  if (existing) {
    // Unlike. .select() confirms a row was actually removed before we
    // decrement - if a racing/duplicate call already deleted it, this
    // second delete matches 0 rows and must NOT also decrement the count.
    const { data: deleted } = await supabase
      .from('likes').delete().match({ user_id: profile.id, post_id: postId })
      .select('user_id')
    if (deleted && deleted.length > 0) {
      await supabase.rpc('increment_counter', { p_table: 'posts', p_column: 'likes_count', p_id: postId, p_amount: -1 })
    }
    revalidatePath('/feed')
    revalidatePath(`/post/${postId}`)
    return { liked: false }
  }

  // Like - upsert prevents a duplicate row at the DB level, but with
  // ignoreDuplicates:true a racing/duplicate call still "succeeds" as a
  // silent no-op. .select() tells us whether a NEW row was actually
  // inserted - only then do we bump the counter, or two overlapping calls
  // insert exactly one like row but increment likes_count by 2.
  const { data: insertedRows, error: insertError } = await supabase
    .from('likes')
    .upsert({ user_id: profile.id, post_id: postId }, { onConflict: 'user_id,post_id', ignoreDuplicates: true })
    .select('user_id')

  if (insertError) return { error: 'Failed to like post' }
  if (!insertedRows || insertedRows.length === 0) return { liked: true }

  await supabase.rpc('increment_counter', { p_table: 'posts', p_column: 'likes_count', p_id: postId, p_amount: 1 })
  void notifyPostAuthor(supabase, postId, profile.id, 'post_like')
  revalidatePath('/feed')
  revalidatePath(`/post/${postId}`)
  return { liked: true }
}

export async function toggleRepostAction(postId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  const { data: existing } = await supabase.from('posts').select('id').match({ user_id: profile.id, post_type: 'repost', quoted_post_id: postId }).maybeSingle()
  if (existing) {
    const { data: deleted } = await supabase.from('posts').delete().match({ id: existing.id }).select('id')
    if (deleted && deleted.length > 0) {
      await supabase.rpc('increment_counter', { p_table: 'posts', p_column: 'reposts_count', p_id: postId, p_amount: -1 })
    }
    revalidatePath('/feed')
    return { reposted: false }
  }
  const { data: inserted } = await supabase.from('posts').insert({ user_id: profile.id, post_type: 'repost', quoted_post_id: postId }).select('id')
  if (!inserted || inserted.length === 0) return { reposted: true }
  await supabase.rpc('increment_counter', { p_table: 'posts', p_column: 'reposts_count', p_id: postId, p_amount: 1 })
  void notifyPostAuthor(supabase, postId, profile.id, 'post_repost')
  revalidatePath('/feed')
  return { reposted: true }
}

export async function toggleBookmarkAction(postId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  const { data: existing } = await supabase.from('bookmarks').select('id').match({ user_id: profile.id, post_id: postId }).maybeSingle()
  if (existing) {
    const { data: deleted } = await supabase.from('bookmarks').delete().match({ user_id: profile.id, post_id: postId }).select('id')
    if (deleted && deleted.length > 0) bumpCounter(supabase, 'posts', 'bookmarks_count', postId, -1)
    return { bookmarked: false }
  }
  const { data: inserted } = await supabase.from('bookmarks').insert({ user_id: profile.id, post_id: postId }).select('id')
  if (inserted && inserted.length > 0) bumpCounter(supabase, 'posts', 'bookmarks_count', postId, 1)
  return { bookmarked: true }
}

// ── Impression tracking ──────────────────────────────────────────────────────
// Fires when a post scrolls into the viewport.
// Uses post_views table with UNIQUE(post_id, user_id) so each user is counted
// only once per post - the DB trigger then increments posts.impressions_count.
export async function recordImpressionAction(postId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return
  // ignoreDuplicates = true means ON CONFLICT DO NOTHING - safe to call repeatedly
  await supabase
    .from('post_views')
    .upsert({ post_id: postId, user_id: profile.id }, { onConflict: 'post_id,user_id', ignoreDuplicates: true })
}

// ── Link click tracking ───────────────────────────────────────────────────────
export async function recordLinkClickAction(postId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return
  void supabase.rpc('increment_counter', { p_table: 'posts', p_column: 'link_clicks_count', p_id: postId, p_amount: 1 })
}

// ── Detail expand tracking ────────────────────────────────────────────────────
export async function recordDetailExpandAction(postId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return
  void supabase.rpc('increment_counter', { p_table: 'posts', p_column: 'detail_expands_count', p_id: postId, p_amount: 1 })
}

// ── Video view tracking ───────────────────────────────────────────────────────
// called when video reaches 3s of watch time
export async function recordVideoViewAction(postId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return
  void supabase.rpc('increment_counter', { p_table: 'posts', p_column: 'video_views_count', p_id: postId, p_amount: 1 })
}

// called when video reaches >= 95% completion
export async function recordVideoCompletionAction(postId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return
  void supabase.rpc('increment_counter', { p_table: 'posts', p_column: 'video_completions_count', p_id: postId, p_amount: 1 })
}

// ── Profile visit tracking ────────────────────────────────────────────────────
// Fires when a viewer clicks the author's avatar/name from a specific post -
// attributes the resulting profile visit back to that post for analytics.
export async function recordProfileVisitFromPostAction(postId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return
  void supabase.rpc('increment_counter', { p_table: 'posts', p_column: 'profile_visits_count', p_id: postId, p_amount: 1 })
}

async function notifyPostAuthor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string, actorId: string,
  type: 'post_like' | 'post_repost' | 'post_comment' | 'post_quote',
  metadata: Record<string, unknown> = {},
) {
  const { data: post } = await supabase.from('posts').select('user_id').eq('id', postId).single()
  if (!post || post.user_id === actorId) return
  await createNotification({ recipientId: post.user_id, actorId, type, entityId: postId, entityType: 'post', metadata })
}

// Fan-out for "post notifications": one `new_post` notification per subscriber.
// Goes through createNotification, so each subscriber's Preferences (Posts from
// people you follow), mutes/blocks and the push switch are all respected.
async function notifyPostSubscribers(postId: string, authorId: string) {
  const admin = createAdminClient()
  const { data: subs, error } = await admin
    .from('user_notification_preferences')
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
// one (in-app + push, via the shared createNotification pipeline) and,
// where the recipient hasn't opted out (notif_email), emails them too -
// the 'mention' email template already existed in lib/email/send.ts but
// had no caller anywhere in the app, so tagging someone produced no
// notification of any kind.
async function notifyMentions(
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

  await Promise.all(mentioned.map(async user => {
    if (user.id === actorId) return // don't notify yourself for @your_own_username
    await createNotification({ recipientId: user.id, actorId, type: 'mention', entityId: postId, entityType: 'post' })

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
export async function getPostAnalyticsAction(postId: string) {
  const supabase = await createClient()
  const { data: post, error } = await supabase
    .from('posts')
    .select(`
      id, body, created_at,
      likes_count, comments_count, reposts_count, quotes_count,
      bookmarks_count, impressions_count,
      video_views_count, video_completions_count,
      link_clicks_count, detail_expands_count, profile_visits_count,
      author:users!posts_user_id_fkey(id, auth_id, display_name, username, avatar_url)
    `)
    .eq('id', postId)
    .is('deleted_at', null)
    .single()

  if (error || !post) return { error: 'Post not found' }

  // Only the post author can view analytics
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if ((post.author as any)?.auth_id !== user.id) return { error: 'Not authorized' }

  // "Engagements" - total interactions, mirroring how X/Twitter defines it:
  // every distinct action a viewer took on the post, not just likes/replies.
  const engagements_count =
    post.likes_count + post.comments_count + post.reposts_count + post.quotes_count +
    post.bookmarks_count + post.link_clicks_count + post.detail_expands_count +
    post.profile_visits_count

  return { data: { ...post, engagements_count } }
}
export async function togglePinPostAction(postId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  // Check if this post is already pinned
  const { data: post } = await supabase
    .from('posts')
    .select('id, is_pinned, user_id')
    .eq('id', postId)
    .single()

  if (!post) return { error: 'Post not found' }
  if (post.user_id !== profile.id) return { error: 'Not your post' }

  if (post.is_pinned) {
    // Unpin
    await supabase.from('posts').update({ is_pinned: false }).eq('id', postId)
    revalidatePath('/profile')
    revalidatePath(`/user/${profile.username}`)
    revalidatePath(`/post/${postId}`)
    return { pinned: false }
  } else {
    // Unpin any existing pinned post first (only one allowed)
    await supabase
      .from('posts')
      .update({ is_pinned: false })
      .eq('user_id', profile.id)
      .eq('is_pinned', true)

    // Pin this post
    await supabase.from('posts').update({ is_pinned: true }).eq('id', postId)
    revalidatePath('/profile')
    revalidatePath(`/user/${profile.username}`)
    revalidatePath(`/post/${postId}`)
    return { pinned: true }
  }
}

export async function checkHasPinnedPostAction(): Promise<{ hasPinnedPost: boolean }> {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { hasPinnedPost: false }
  const { data } = await supabase
    .from('posts')
    .select('id')
    .eq('user_id', profile.id)
    .eq('is_pinned', true)
    .is('deleted_at', null)
    .maybeSingle()
  return { hasPinnedPost: !!data }
}