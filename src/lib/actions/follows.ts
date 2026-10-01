'use server'

/**
 * follows.ts — social graph mutations only.
 * follow, unfollow, block, mute.
 * Previously scattered in social.ts.
 */

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { getBlockState } from '@/lib/mutuals'

// followers_count / following_count are maintained by the trg_sync_follow_counts
// trigger on `follows` (migration 042) - never write them from app code.

// ─── Follow-spam limits ──────────────────────────────────────────────────────
// Following too many accounts too quickly pauses the person's ability to follow
// for a few hours. Tune the numbers here - no migration needed.
const FOLLOW_BURST_LIMIT      = 25          // new follows allowed inside the burst window...
const FOLLOW_BURST_WINDOW_SEC = 10 * 60     // ...of 10 minutes
const FOLLOW_BURST_PAUSE_SEC  = 3 * 3600    // pause after a burst: 3 hours
const FOLLOW_DAILY_LIMIT      = 150         // new follows allowed in any 24 hours
const FOLLOW_DAILY_PAUSE_SEC  = 6 * 3600    // pause after hitting the daily cap: 6 hours

// Records a new follow against the person's limits. Returns when the pause ends
// if they are (now) paused, or null if the follow may go ahead. Fails open on an
// unexpected error: a limiter outage shouldn't stop everyone from following.
async function registerFollowAttempt(userId: string): Promise<Date | null> {
  try {
    const { data, error } = await createAdminClient().rpc('register_follow_attempt', {
      p_user: userId,
      p_burst_limit: FOLLOW_BURST_LIMIT,
      p_burst_window_secs: FOLLOW_BURST_WINDOW_SEC,
      p_burst_pause_secs: FOLLOW_BURST_PAUSE_SEC,
      p_daily_limit: FOLLOW_DAILY_LIMIT,
      p_daily_pause_secs: FOLLOW_DAILY_PAUSE_SEC,
    })
    if (error) {
      console.error('register_follow_attempt failed, allowing follow:', error.message)
      return null
    }
    return data ? new Date(data as string) : null
  } catch (err) {
    console.error('register_follow_attempt threw, allowing follow:', err)
    return null
  }
}

function followPausedResponse(until: Date) {
  const hours = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 3_600_000))
  return {
    error: `You're following people too quickly, so following is paused for about ${hours} hour${hours === 1 ? '' : 's'}. Please try again later.`,
    code: 'follow_paused' as const,
    pausedUntil: until.toISOString(),
  }
}

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, profile: null }
  const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
  return { supabase, profile }
}

// ─── Follow / Unfollow ────────────────────────────────────────────────────────

// `desired` is the state being asked for (true = following). When given, the
// action is idempotent: following someone already followed (a retried request,
// a double tap, a stale screen) changes nothing instead of unfollowing them.
// Without it this behaves as a plain toggle. `changed` reports whether the
// database actually moved.
export async function toggleFollowAction(targetUserId: string, desired?: boolean) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (profile.id === targetUserId) return { error: 'You cannot follow yourself' }

  const { data: existing } = await supabase
    .from('follows')
    .select('id')
    .match({ follower_id: profile.id, following_id: targetUserId })
    .maybeSingle()

  const isFollowing = !!existing
  const target = desired ?? !isFollowing
  if (target === isFollowing) return { following: isFollowing, changed: false }

  // A brand-new follow counts against the spam limit. Unfollows and no-op
  // repeats (a retried request, a double tap) never do.
  if (!isFollowing) {
    const pausedUntil = await registerFollowAttempt(profile.id)
    if (pausedUntil) return followPausedResponse(pausedUntil)
  }

  // Nobody can follow across a block, in either direction. The wording never
  // reveals that THEY blocked you.
  if (!isFollowing) {
    const block = await getBlockState(profile.id, targetUserId)
    if (block.byMe) return { error: 'Unblock this account to follow them.', code: 'follow_blocked' as const }
    if (block.byThem) return { error: "You can't follow this account.", code: 'follow_blocked' as const }
  }

  // Only look the username up when something is actually changing
  const { data: targetUser } = await supabase.from('users').select('username').eq('id', targetUserId).single()
  const targetUsername = targetUser?.username ?? targetUserId

  if (isFollowing) {
    await supabase.from('follows').delete().match({ follower_id: profile.id, following_id: targetUserId })
    revalidatePath('/profile')
    revalidatePath(`/user/${targetUsername}`)
    return { following: false, changed: true }
  }

  const { error } = await supabase.from('follows').insert({ follower_id: profile.id, following_id: targetUserId })
  if (error?.code === '23505') return { following: true, changed: false }
  if (error?.code === '42501') return { error: 'Permission denied. Please log out and back in.' }
  if (error) return { error: `Could not follow: ${error.message}` }

  void createNotification({
    recipientId: targetUserId, actorId: profile.id,
    type: 'new_follower', entityId: profile.id, entityType: 'user',
  })
  revalidatePath('/profile')
  revalidatePath(`/user/${targetUsername}`)
  return { following: true, changed: true }
}

// ─── Read-only: check if currently following ──────────────────────────────────

export async function getFollowStatusAction(targetUserId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { following: false }
  const { data } = await supabase
    .from('follows').select('id')
    .match({ follower_id: profile.id, following_id: targetUserId })
    .maybeSingle()
  return { following: !!data }
}

// ─── Block / Unblock ─────────────────────────────────────────────────────────

export async function toggleBlockAction(targetUserId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (profile.id === targetUserId) return { error: 'You cannot block yourself' }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
    return { error: 'Invalid user' }
  }

  const { data: existing } = await supabase
    .from('user_blocks').select('blocker_id')
    .match({ blocker_id: profile.id, blocked_id: targetUserId })
    .maybeSingle()

  if (existing) {
    await supabase.from('user_blocks').delete().match({ blocker_id: profile.id, blocked_id: targetUserId })
    return { blocked: false }
  }

  // Remove follow in both directions when blocking. Counts follow from the
  // deleted rows via the follows trigger (migration 042).
  // RLS only lets a user delete follows where THEY are the follower, so the
  // other direction needs the admin client. Two exact-match deletes scoped to
  // this pair (no string-built filter, since targetUserId comes from the browser).
  const admin = createAdminClient()
  const [mine, theirs] = await Promise.all([
    admin.from('follows').delete().match({ follower_id: profile.id, following_id: targetUserId }),
    admin.from('follows').delete().match({ follower_id: targetUserId, following_id: profile.id }),
  ])
  if (mine.error || theirs.error) return { error: 'Could not block this account. Please try again.' }

  await supabase.from('user_blocks').insert({ blocker_id: profile.id, blocked_id: targetUserId })
  revalidatePath('/feed')
  return { blocked: true }
}

// ─── Mute / Unmute ────────────────────────────────────────────────────────────

export async function toggleMuteAction(targetUserId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  const { data: existing } = await supabase
    .from('user_mutes').select('muter_id')
    .match({ muter_id: profile.id, muted_id: targetUserId })
    .maybeSingle()

  if (existing) {
    await supabase.from('user_mutes').delete().match({ muter_id: profile.id, muted_id: targetUserId })
    return { muted: false }
  }
  await supabase.from('user_mutes').insert({ muter_id: profile.id, muted_id: targetUserId })
  return { muted: true }
}
// ─── Suggested accounts for onboarding ───────────────────────────────────────
// Returns real accounts sorted by followers_count.
// If interestIds are provided, prioritises accounts whose posts use those hashtags.
// Falls back to top accounts by followers if interest matching yields < 3 results.

export async function getSuggestedAccountsAction(interestIds: string[] = []): Promise<{
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  followers_count: number
  verification_tier: string
  is_monetised: boolean
}[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get current user profile to exclude self and already-followed
  let excludeIds: string[] = []
  if (user) {
    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', user.id).single()
    if (profile) {
      excludeIds = [profile.id]
      const { data: following } = await supabase
        .from('follows').select('following_id').eq('follower_id', profile.id)
      if (following) excludeIds.push(...following.map((f: any) => f.following_id))
    }
  }

  // Try interest-based suggestions first
  if (interestIds.length > 0) {
    const { data: tags } = await supabase
      .from('hashtags').select('id').in('tag', interestIds)
    const tagIds = (tags || []).map((t: any) => t.id)

    if (tagIds.length > 0) {
      // Find authors who post about these interests
      const { data: postRows } = await supabase
        .from('post_hashtags')
        .select('post:posts(user_id)')
        .in('hashtag_id', tagIds)
        .limit(200)

      const authorIds = [...new Set(
        (postRows || [])
          .map((r: any) => r.post?.user_id)
          .filter((id: string | undefined) => id && !excludeIds.includes(id))
      )]

      if (authorIds.length >= 3) {
        let q = supabase
          .from('users')
          .select('id, username, display_name, avatar_url, bio, followers_count, verification_tier, is_monetised')
          .in('id', authorIds.slice(0, 50))
          .eq('status', 'active')
          .is('deleted_at', null)
          .order('followers_count', { ascending: false })
          .limit(8)

        const { data } = await q
        if ((data || []).length >= 3) return data as any[]
      }
    }
  }

  // Fallback: top accounts by followers
  let q = supabase
    .from('users')
    .select('id, username, display_name, avatar_url, bio, followers_count, verification_tier, is_monetised')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('followers_count', { ascending: false })
    .limit(8)

  if (excludeIds.length > 0) {
    q = q.not('id', 'in', `(${excludeIds.join(',')})`)
  }

  const { data } = await q
  return (data || []) as any[]
}

// ─── Toggle post notifications for a user ────────────────────────────────────
// Inserts or deletes a row in user_notifications_settings.
// Returns the new state.
export async function togglePostNotificationsAction(targetUserId: string): Promise<
  { enabled: boolean } | { error: string }
> {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }

  const { data: existing } = await supabase
    .from('user_notification_preferences')
    .select('id')
    .match({ user_id: profile.id, target_user_id: targetUserId, type: 'post' })
    .maybeSingle()

  if (existing) {
    await supabase.from('user_notification_preferences').delete().eq('id', existing.id)
    return { enabled: false }
  }
  await supabase.from('user_notification_preferences').insert({
    user_id: profile.id, target_user_id: targetUserId, type: 'post',
  })
  return { enabled: true }
}

export async function getPostNotificationsStatusAction(targetUserId: string): Promise<boolean> {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return false
  const { data } = await supabase
    .from('user_notification_preferences')
    .select('id')
    .match({ user_id: profile.id, target_user_id: targetUserId, type: 'post' })
    .maybeSingle()
  return !!data
}