// src/lib/public-data.ts
//
// Read-only queries behind the PUBLIC pages (/p/[id], /u/[username], /discover,
// and the live-posts strip on the home page) - the pages search engines and
// logged-out visitors can see.
//
// Everything here goes through the admin client on purpose: public pages must
// not depend on the visitor's RLS role. That makes the filters below the ONLY
// thing standing between a private/deleted/sensitive post and the open web, so
// every query goes through publicPostsBase() and nothing selects from `posts`
// directly. Only fields that are already visible on a public profile are
// selected - never email, phone, wallet, BVN/NIN or anything private.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/server'
import { getProfileByUsername } from '@/lib/queries'

export interface PublicAuthor {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  verification_tier: string | null
  is_monetised: boolean | null
}

export interface PublicMedia {
  id: string
  media_type: string
  url: string
  thumbnail_url: string | null
  width: number | null
  height: number | null
  position: number | null
}

export interface PublicPost {
  id: string
  body: string | null
  post_type: string
  likes_count: number
  comments_count: number
  reposts_count: number
  created_at: string
  is_selling: boolean
  parent_post_id: string | null
  author: PublicAuthor
  media: PublicMedia[]
}

export interface PublicCreator {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  followers_count: number
  verification_tier: string | null
}

// A post needs real text to be worth indexing or showing as a "featured" post.
// One-liners and media-only posts are fine inside the app, but they read as
// thin content to a crawler (which is exactly what AdSense reviewers flagged).
export const MIN_INDEXABLE_BODY = 40

export function isSubstantial(p: Pick<PublicPost, 'body'>): boolean {
  return (p.body?.trim().length ?? 0) >= MIN_INDEXABLE_BODY
}

const POST_SELECT = `
  id, body, post_type, likes_count, comments_count, reposts_count,
  created_at, is_selling, parent_post_id,
  author:users!posts_user_id_fkey!inner(
    id, username, display_name, avatar_url, verification_tier, is_monetised,
    is_private, status, deleted_at
  ),
  media:post_media(id, media_type, url, thumbnail_url, width, height, position)
`

type Admin = ReturnType<typeof createAdminClient>

// The one gate. A post is public only if: not deleted, not marked sensitive,
// and its author is active, not deleted and not a private account.
function publicPostsBase(admin: Admin) {
  return admin
    .from('posts')
    .select(POST_SELECT)
    .is('deleted_at', null)
    .eq('is_sensitive', false)
    .eq('author.is_private', false)
    .eq('author.status', 'active')
    .is('author.deleted_at', null)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(row: any): PublicPost {
  const author = Array.isArray(row.author) ? row.author[0] : row.author
  const media = ((row.media ?? []) as PublicMedia[])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  return {
    id: row.id,
    body: row.body ?? null,
    post_type: row.post_type,
    likes_count: row.likes_count ?? 0,
    comments_count: row.comments_count ?? 0,
    reposts_count: row.reposts_count ?? 0,
    created_at: row.created_at,
    is_selling: !!row.is_selling,
    parent_post_id: row.parent_post_id ?? null,
    author: {
      id: author.id,
      username: author.username,
      display_name: author.display_name,
      avatar_url: author.avatar_url ?? null,
      verification_tier: author.verification_tier ?? null,
      is_monetised: author.is_monetised ?? null,
    },
    media,
  }
}

// cache() de-dupes the call between generateMetadata and the page itself.
export const getPublicPost = cache(async (id: string): Promise<PublicPost | null> => {
  try {
    const { data } = await publicPostsBase(createAdminClient()).eq('id', id).maybeSingle()
    return data ? normalize(data) : null
  } catch {
    return null
  }
})

export async function getPublicReplies(postId: string, limit = 30): Promise<PublicPost[]> {
  try {
    const { data } = await publicPostsBase(createAdminClient())
      .eq('parent_post_id', postId)
      .order('likes_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map(normalize)
  } catch {
    return []
  }
}

export async function getLatestPublicPosts(
  limit = 20,
  opts: { sellingOnly?: boolean; substantialOnly?: boolean } = {},
): Promise<PublicPost[]> {
  const { sellingOnly = false, substantialOnly = true } = opts
  try {
    let q = publicPostsBase(createAdminClient())
      .is('parent_post_id', null)
      .neq('post_type', 'repost')
    if (sellingOnly) q = q.eq('is_selling', true)
    // Over-fetch, because the substance filter runs in JS after the query.
    const { data } = await q.order('created_at', { ascending: false }).limit(limit * 4)
    const posts = (data ?? []).map(normalize)
    return (substantialOnly ? posts.filter(isSubstantial) : posts).slice(0, limit)
  } catch {
    return []
  }
}

export async function getPublicProfilePosts(userId: string, limit = 25): Promise<PublicPost[]> {
  try {
    const { data } = await publicPostsBase(createAdminClient())
      .eq('user_id', userId)
      .is('parent_post_id', null)
      .neq('post_type', 'repost')
      .order('created_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map(normalize)
  } catch {
    return []
  }
}

// Profile for the public /u/[username] page. Banned/deleted profiles come back
// null (-> 404). Private profiles come back flagged so the page can show a
// "this account is private" state instead of any content.
export const getPublicProfile = cache(async (username: string) => {
  const profile = await getProfileByUsername(username)
  if (!profile || profile.status === 'banned') return null
  return profile
})

export async function getTopCreators(limit = 12): Promise<PublicCreator[]> {
  try {
    const { data } = await createAdminClient()
      .from('users')
      .select('id, username, display_name, avatar_url, bio, followers_count, verification_tier')
      .eq('is_private', false)
      .eq('status', 'active')
      .is('deleted_at', null)
      .or('role.is.null,role.not.in.(admin,moderator)')
      .gt('posts_count', 0)
      .order('followers_count', { ascending: false })
      .limit(limit)
    return (data ?? []) as PublicCreator[]
  } catch {
    return []
  }
}
