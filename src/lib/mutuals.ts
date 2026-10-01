// src/lib/mutuals.ts
//
// Two users are "mutual" when each follows the other. Chat is only allowed
// between mutuals, and never when either side has blocked the other.
// Uses the admin client: this runs inside server actions/pages that must see
// both directions of a follow/block regardless of RLS (a user's own client
// cannot see rows where THEY are the one who was blocked).

import { createAdminClient } from '@/lib/supabase/server'
import type { ChatLockReason } from '@/lib/chat-access'

export async function areMutuals(userA: string, userB: string): Promise<boolean> {
  if (!userA || !userB || userA === userB) return false
  const admin = createAdminClient()
  const [{ data: aFollowsB }, { data: bFollowsA }] = await Promise.all([
    admin.from('follows').select('id').match({ follower_id: userA, following_id: userB }).maybeSingle(),
    admin.from('follows').select('id').match({ follower_id: userB, following_id: userA }).maybeSingle(),
  ])
  return !!aFollowsB && !!bFollowsA
}

/** Block state between me and another user, in both directions. */
export async function getBlockState(me: string, other: string): Promise<{ byMe: boolean; byThem: boolean }> {
  if (!me || !other || me === other) return { byMe: false, byThem: false }
  const admin = createAdminClient()
  const { data } = await admin
    .from('user_blocks')
    .select('blocker_id, blocked_id')
    .or(`and(blocker_id.eq.${me},blocked_id.eq.${other}),and(blocker_id.eq.${other},blocked_id.eq.${me})`)
  const rows = data || []
  return {
    byMe: rows.some((r: any) => r.blocker_id === me),
    byThem: rows.some((r: any) => r.blocker_id === other),
  }
}

/** Why `me` can't write to `other` - or null if they can. */
export async function getChatLockReason(me: string, other: string): Promise<ChatLockReason | null> {
  const [block, mutual] = await Promise.all([getBlockState(me, other), areMutuals(me, other)])
  if (block.byMe) return 'blocked_by_me'
  if (block.byThem || !mutual) return 'not_mutual'   // a block by them looks like "not mutual"
  return null
}

/** Same as getChatLockReason for many people at once (the conversation list). */
export async function getChatLockReasons(me: string, otherIds: string[]): Promise<Map<string, ChatLockReason | null>> {
  const out = new Map<string, ChatLockReason | null>()
  const ids = [...new Set(otherIds.filter(Boolean))]
  if (ids.length === 0) return out
  const admin = createAdminClient()
  const [{ data: blocks }, { data: iFollow }, { data: followMe }] = await Promise.all([
    admin.from('user_blocks').select('blocker_id, blocked_id')
      .or(`and(blocker_id.eq.${me},blocked_id.in.(${ids.join(',')})),and(blocked_id.eq.${me},blocker_id.in.(${ids.join(',')}))`),
    admin.from('follows').select('following_id').eq('follower_id', me).in('following_id', ids),
    admin.from('follows').select('follower_id').eq('following_id', me).in('follower_id', ids),
  ])
  const blockedByMe = new Set((blocks || []).filter((b: any) => b.blocker_id === me).map((b: any) => b.blocked_id))
  const blockedMe = new Set((blocks || []).filter((b: any) => b.blocked_id === me).map((b: any) => b.blocker_id))
  const iF = new Set((iFollow || []).map((r: any) => r.following_id))
  const fM = new Set((followMe || []).map((r: any) => r.follower_id))
  for (const id of ids) {
    out.set(id, blockedByMe.has(id) ? 'blocked_by_me'
      : blockedMe.has(id) || !(iF.has(id) && fM.has(id)) ? 'not_mutual'
      : null)
  }
  return out
}

/** People the user follows who also follow them back (newest follow first). */
export async function getMutuals(userId: string, limit = 100) {
  const admin = createAdminClient()
  const [{ data: following }, { data: followers }] = await Promise.all([
    admin.from('follows')
      .select(`following_id, following:users!follows_following_id_fkey(
        id, username, display_name, avatar_url, verification_tier, followers_count
      )`)
      .eq('follower_id', userId)
      .order('created_at', { ascending: false }),
    admin.from('follows').select('follower_id').eq('following_id', userId),
  ])
  const followerIds = new Set((followers || []).map((r: any) => r.follower_id))
  return (following || [])
    .filter((r: any) => r.following && followerIds.has(r.following_id))
    .map((r: any) => r.following)
    .slice(0, limit)
}
