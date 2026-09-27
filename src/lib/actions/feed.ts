'use server'

/**
 * feed.ts — server actions that RETURN feed data.
 * These are the "queries with auth context" — they need the caller's
 * identity to filter blocks/mutes and hydrate like/bookmark state.
 *
 * Pure read-only queries (no auth required) live in lib/queries/posts.ts.
 * Cursor-based pagination so the client can implement infinite scroll.
 */

import { createClient } from '@/lib/supabase/server'

const PAGE_SIZE = 20

// Scheduled posts carry a future created_at (see createPostAction) and must
// never surface in a feed/listing - including the author's own profile -
// until that moment arrives. RLS already enforces this as the real security
// boundary; this is the query-level mirror of it so scheduled rows don't
// even get fetched.
const nowIso = () => new Date().toISOString()

// ─── Space out selling posts so the feed doesn't read like a marketplace ─────
// Keeps every post, but re-sorts within the page so no two selling posts sit
// closer than `gap` positions apart — same "merge every N" technique already
// used above for interest-based interleaving, just splitting one page into
// two pools instead of merging two separate queries.
function spaceOutSellingPosts<T extends { is_selling?: boolean }>(posts: T[], gap = 4): T[] {
  const selling = posts.filter(p => p.is_selling)
  const regular = posts.filter(p => !p.is_selling)
  if (selling.length === 0) return posts

  const result: T[] = []
  let ri = 0, si = 0
  while (ri < regular.length || si < selling.length) {
    for (let i = 0; i < gap && ri < regular.length; i++) result.push(regular[ri++])
    if (si < selling.length) result.push(selling[si++])
  }
  return result
}

// ─── Raw query row shape ──────────────────────────────────────────────────────
// What every `.select(...)` call in this file actually returns at runtime,
// before hydrateEngagement() attaches is_liked/is_reposted/is_bookmarked/
// quoted_post. Exists purely to fix a TypeScript inference mismatch:
// Supabase's generated types infer a to-one FK join
// (`author:users!posts_user_id_fkey(...)`) as an ARRAY (`author: User[]`)
// unless the relationship is unambiguous in the generated schema - but at
// runtime it's always a single row (a post has exactly one author), which
// is what the hand-written FeedPost interface below correctly declares.
// That mismatch used to surface the moment a promoted post (built to match
// FeedPost's singular-author shape) got spliced into an array of raw query
// rows (typed with author as an array) - TypeScript couldn't reconcile the
// two element types. Casting every raw result to RawFeedRow once, right at
// the query boundary, makes every array in this file agree on one shape and
// keeps that mismatch from resurfacing as new query sites get added.
type RawFeedRow = Omit<FeedPost, 'is_liked' | 'is_reposted' | 'is_bookmarked' | 'quoted_post'> & {
  quoted_post_id: string | null
  is_promoted?: boolean
  promotion_id?: string
}

function asRawRows(data: unknown): RawFeedRow[] {
  return (data ?? []) as RawFeedRow[]
}

// ─── Promoted posts — paid boosts injected into the algorithmic feed ─────────
// This is the actual "reach" a promotion buys: unlike the interest-matching
// block inside getForYouFeedAction below, this pick is NOT filtered by the
// viewer's saved interests and does not require them to follow the author -
// that's the whole point of paying to be shown to people who wouldn't
// otherwise see the post, same as a Promoted Tweet on X or a Sponsored post
// in a Facebook feed. Blocks/mutes still apply (a promotion can't force a
// post past someone who's actively blocked that author), and a promotion
// never shows to its own buyer - "reach" means new audience, not padding
// the author's own scroll.
const PROMOTED_POSITION = 3      // inserted after the 4th organic post (0-indexed) - early, like the real platforms, not buried
const PROMOTED_FETCH_LIMIT = 10  // candidate pool size - picking randomly from this keeps rotation varied across page loads/refreshes

async function pickPromotedPost(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewerId: string,
  excludeIds: string[],
  alreadyOnPageIds: Set<string>,
): Promise<(RawFeedRow & { promotion_id: string }) | null> {
  const { data: promoRows } = await supabase
    .from('post_promotions')
    .select(`
      id, ends_at,
      post:posts!inner(
        id, body, post_type, likes_count, comments_count, reposts_count,
        bookmarks_count, impressions_count, link_clicks_count, detail_expands_count,
        video_views_count, video_completions_count, created_at, edited_at,
        is_sensitive, is_pinned, quoted_post_id, is_selling, parent_post_id, deleted_at, user_id,
        author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier, is_monetised),
        media:post_media(id, media_type, url, thumbnail_url, width, height, position)
      )
    `)
    .eq('status', 'active')
    // No cron currently flips an expired promotion's status to 'completed'
    // (see admin promotions page) - ends_at is the real source of truth for
    // "is this still live", so it's checked here rather than trusting status alone.
    .or(`ends_at.is.null,ends_at.gt.${nowIso()}`)
    .order('created_at', { ascending: false })
    .limit(PROMOTED_FETCH_LIMIT)

  const candidates = (promoRows || [])
    .map((r: any) => ({ promotionId: r.id as string, post: r.post }))
    .filter(({ post }) =>
      post && !post.deleted_at && !post.parent_post_id && post.post_type !== 'repost' &&
      post.user_id !== viewerId &&
      !excludeIds.includes(post.user_id) &&
      post.created_at <= nowIso()
    )

  if (!candidates.length) return null

  // Prefer a post not already organically on this page - if it's already
  // there, the caller tags that existing row instead of inserting a
  // duplicate (see getForYouFeedAction). Falls back to any candidate if
  // every one happens to already be on the page.
  const fresh = candidates.filter(c => !alreadyOnPageIds.has(c.post.id))
  const pool = fresh.length ? fresh : candidates
  const choice = pool[Math.floor(Math.random() * pool.length)]

  return { ...choice.post, promotion_id: choice.promotionId, is_promoted: true } as RawFeedRow & { promotion_id: string }
}

// Shape of a fully-hydrated feed post
export interface FeedPost {
  id: string
  body: string | null
  post_type: string
  likes_count: number
  comments_count: number
  reposts_count: number
  bookmarks_count: number
  impressions_count: number
  link_clicks_count: number
  detail_expands_count: number
  video_views_count: number
  video_completions_count: number
  created_at: string
  edited_at: string | null
  is_sensitive: boolean
  author: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
    verification_tier: string
    is_monetised: boolean
  }
  media: Array<{
    id: string
    media_type: string
    url: string
    thumbnail_url: string | null
    width: number | null
    height: number | null
    position: number
  }>
  quoted_post_id: string | null
  quoted_post?: {
    is_selling: boolean
    id: string
    body: string | null
    created_at: string
    author: { id: string; username: string; display_name: string; avatar_url: string | null; verification_tier: string }
    media: Array<{ id: string; media_type: string; url: string; thumbnail_url: string | null; width: number | null; height: number | null; position: number }>
  } | null
  is_liked: boolean
  is_reposted: boolean
  is_bookmarked: boolean
  is_pinned: boolean
  is_selling: boolean
  /** True when this post is showing because someone paid to boost it
   *  (post_promotions), not because it matched the viewer's interests or
   *  chronological position - see getForYouFeedAction. Absent/false on
   *  every other feed and listing. */
  is_promoted?: boolean
  promotion_id?: string
}

// ─── "For you" feed — algorithmic ────────────────────────────────────────────

export async function getForYouFeedAction(cursor?: string): Promise<{
  posts: FeedPost[]
  nextCursor: string | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { posts: [], nextCursor: null }

  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return { posts: [], nextCursor: null }

  // Load user's saved interests
  const { data: savedInterests } = await supabase
    .from('user_interests').select('interest').eq('user_id', profile.id)
  const interestIds = (savedInterests || []).map((r: any) => r.interest)

  // Exclude posts from blocked/muted users
  const [{ data: blocks }, { data: mutes }] = await Promise.all([
    supabase.from('user_blocks').select('blocked_id').eq('blocker_id', profile.id),
    supabase.from('user_mutes').select('muted_id').eq('muter_id', profile.id),
  ])
  const excludeIds = [
    ...(blocks || []).map((b: {blocked_id: string}) => b.blocked_id),
    ...(mutes || []).map((m: {muted_id: string}) => m.muted_id),
  ]

  let query = supabase
    .from('posts')
    .select(`
      id, body, post_type, likes_count, comments_count, reposts_count,
      bookmarks_count, impressions_count, link_clicks_count, detail_expands_count, video_views_count, video_completions_count, created_at, edited_at, is_sensitive, is_pinned, quoted_post_id, is_selling,
      author:users!posts_user_id_fkey(
        id, username, display_name, avatar_url, verification_tier, is_monetised
      ),
      media:post_media(id, media_type, url, thumbnail_url, width, height, position)
    `)
    .is('deleted_at', null)
    .is('parent_post_id', null)          // top-level posts only
    // Repost rows (post_type: 'repost') used to be excluded here entirely,
    // which is why reposts/quotes never showed up in the feed at all - not
    // even out of position, just missing. hydrateEngagement() below already
    // resolves quoted_post for them (it was written to), and PostCard
    // already renders them as RepostCard - this filter was the only thing
    // stopping that pipeline from ever running. Removed so a repost surfaces
    // like any other post, at its own created_at (i.e. when it happened).
    .lte('created_at', nowIso())         // exclude scheduled posts not yet due
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)                // fetch one extra to know if there's a next page

  if (excludeIds.length) {
    query = query.not('user_id', 'in', `(${excludeIds.join(',')})`)
  }
  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data: posts } = await query
  const rawPosts = asRawRows(posts)

  const hasMore = rawPosts.length > PAGE_SIZE
  const page = hasMore ? rawPosts.slice(0, PAGE_SIZE) : rawPosts
  const nextCursor = hasMore ? page[page.length - 1].created_at : null

  // Interest-based personalisation - first page only (pages 2+ continue the
  // plain chronological order from `page` above, which keeps "load more"
  // simple and avoids re-deriving a blended cursor).
  //
  // Matching works by resolving each saved interest to a real hashtag row
  // and pulling posts tagged with it - tagging happens automatically via
  // process_post_hashtags (called from createPostAction whenever a post
  // body contains a #hashtag). Preference-matched posts fill the page
  // first; the general chronological pool (`page`) only backfills the
  // remaining slots, so someone with few or no matching posts yet still
  // sees a full feed instead of an empty one.
  let finalPage: RawFeedRow[] = page
  if (interestIds.length > 0 && !cursor) {
    const { data: tags } = await supabase
      .from('hashtags').select('id').in('tag', interestIds)
    const tagIds = (tags || []).map((t: any) => t.id)

    if (tagIds.length > 0) {
      const { data: interestRows } = await supabase
        .from('post_hashtags')
        .select(`post:posts(
          id, body, post_type, parent_post_id, likes_count, comments_count, reposts_count,
          bookmarks_count, impressions_count, link_clicks_count, detail_expands_count,
          video_views_count, video_completions_count, created_at, edited_at,
          is_sensitive, is_pinned, quoted_post_id, is_selling,
          author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier, is_monetised),
          media:post_media(id, media_type, url, thumbnail_url, width, height, position)
        )`)
        .in('hashtag_id', tagIds)
        .limit(PAGE_SIZE * 2) // fetch generously - most get filtered out below

      const seen = new Set<string>()
      const matched: RawFeedRow[] = ((interestRows || []) as any[])
        .map((r: any) => r.post as RawFeedRow)
        .filter((p: any) =>
          p && !p.parent_post_id && p.post_type !== 'repost' &&
          p.created_at <= nowIso() &&                 // no not-yet-due scheduled posts, own included
          !excludeIds.includes(p.author?.id) &&
          (seen.has(p.id) ? false : (seen.add(p.id), true))  // a post can carry >1 matching hashtag
        )
        .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, PAGE_SIZE)

      if (matched.length > 0) {
        const matchedIds = new Set(matched.map((p: any) => p.id))
        const backfillNeeded = Math.max(0, PAGE_SIZE - matched.length)
        const backfill = page.filter((p: any) => !matchedIds.has(p.id)).slice(0, backfillNeeded)
        finalPage = [...matched, ...backfill]
          .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))
      }
    }
  }

  // Promoted-post injection - runs on every page (not gated by `!cursor`
  // like interest-matching above), since paid reach isn't a first-load-only
  // thing - it should keep showing up as someone keeps scrolling.
  const pageIds = new Set(finalPage.map((p: any) => p.id))
  const promoted = await pickPromotedPost(supabase, profile.id, excludeIds, pageIds)
  if (promoted) {
    if (pageIds.has(promoted.id)) {
      // Already organically present (e.g. it's recent enough to have made
      // the chronological page anyway) - tag that row instead of showing
      // the same post twice.
      finalPage = finalPage.map((p: any) =>
        p.id === promoted.id ? { ...p, is_promoted: true, promotion_id: promoted.promotion_id } : p
      )
    } else {
      const insertAt = Math.min(PROMOTED_POSITION, finalPage.length)
      finalPage = [...finalPage.slice(0, insertAt), promoted, ...finalPage.slice(insertAt)]
    }
  }

  if (!finalPage.length) return { posts: [], nextCursor: null }
  return { posts: await hydrateEngagement(supabase, profile.id, spaceOutSellingPosts(finalPage)), nextCursor }
}

// ─── "Selling" feed — only posts marked as selling something ────────────────
// Powers the dedicated Selling tab. No spacing applied here — spacing exists
// to keep selling posts from dominating the OTHER feeds; this tab's entire
// purpose is to show them, so they run chronologically like any other feed.

export async function getSellingFeedAction(cursor?: string): Promise<{
  posts: FeedPost[]
  nextCursor: string | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { posts: [], nextCursor: null }

  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return { posts: [], nextCursor: null }

  const [{ data: blocks }, { data: mutes }] = await Promise.all([
    supabase.from('user_blocks').select('blocked_id').eq('blocker_id', profile.id),
    supabase.from('user_mutes').select('muted_id').eq('muter_id', profile.id),
  ])
  const excludeIds = [
    ...(blocks || []).map((b: {blocked_id: string}) => b.blocked_id),
    ...(mutes || []).map((m: {muted_id: string}) => m.muted_id),
  ]

  let query = supabase
    .from('posts')
    .select(`
      id, body, post_type, likes_count, comments_count, reposts_count,
      bookmarks_count, impressions_count, link_clicks_count, detail_expands_count, video_views_count, video_completions_count, created_at, edited_at, is_sensitive, is_pinned, quoted_post_id, is_selling,
      author:users!posts_user_id_fkey(
        id, username, display_name, avatar_url, verification_tier, is_monetised
      ),
      media:post_media(id, media_type, url, thumbnail_url, width, height, position)
    `)
    .is('deleted_at', null)
    .is('parent_post_id', null)
    .eq('is_selling', true)
    .lte('created_at', nowIso())
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (excludeIds.length) {
    query = query.not('user_id', 'in', `(${excludeIds.join(',')})`)
  }
  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data: posts, error: sellingErr } = await query
  if (sellingErr) console.error('[getSellingFeedAction] posts query failed:', sellingErr.message)
  const rawPosts = asRawRows(posts)

  const hasMore = rawPosts.length > PAGE_SIZE
  const page = hasMore ? rawPosts.slice(0, PAGE_SIZE) : rawPosts
  const nextCursor = hasMore ? page[page.length - 1].created_at : null

  if (!page.length) return { posts: [], nextCursor: null }
  return { posts: await hydrateEngagement(supabase, profile.id, page), nextCursor }
}


// ─── "Following" feed — chronological ────────────────────────────────────────

export async function getFollowingFeedAction(cursor?: string): Promise<{
  posts: FeedPost[]
  nextCursor: string | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { posts: [], nextCursor: null }

  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return { posts: [], nextCursor: null }

  // Get following IDs
  const { data: following } = await supabase
    .from('follows').select('following_id').eq('follower_id', profile.id)

  const followingIds = (following || []).map((f: {following_id: string}) => f.following_id)
  if (!followingIds.length) return { posts: [], nextCursor: null }

  let query = supabase
    .from('posts')
    .select(`
      id, body, post_type, likes_count, comments_count, reposts_count,
      bookmarks_count, impressions_count, link_clicks_count, detail_expands_count, video_views_count, video_completions_count, created_at, edited_at, is_sensitive, is_pinned, quoted_post_id, is_selling,
      author:users!posts_user_id_fkey(
        id, username, display_name, avatar_url, verification_tier, is_monetised
      ),
      media:post_media(id, media_type, url, thumbnail_url, width, height, position)
    `)
    .is('deleted_at', null)
    .is('parent_post_id', null)
    // See the identical note in getForYouFeedAction above - excluding
    // reposts here made them invisible in this feed too.
    .in('user_id', followingIds)
    .lte('created_at', nowIso())
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (cursor) query = query.lt('created_at', cursor)

  const { data: posts } = await query
  const rawPosts = asRawRows(posts)
  if (!rawPosts.length) return { posts: [], nextCursor: null }

  const hasMore = rawPosts.length > PAGE_SIZE
  const page = hasMore ? rawPosts.slice(0, PAGE_SIZE) : rawPosts
  const nextCursor = hasMore ? page[page.length - 1].created_at : null

  return { posts: await hydrateEngagement(supabase, profile.id, spaceOutSellingPosts(page)), nextCursor }
}


// ─── Mutuals feed ─────────────────────────────────────────────────────────────

export async function getMutualsFeedAction(cursor?: string): Promise<{
  posts: FeedPost[]
  nextCursor: string | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { posts: [], nextCursor: null }

  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return { posts: [], nextCursor: null }

  // People I follow
  const { data: following, error: followingErr } = await supabase
    .from('follows').select('following_id').eq('follower_id', profile.id)
  if (followingErr) console.error('[getMutualsFeedAction] following query failed:', followingErr.message)
  if (!following?.length) return { posts: [], nextCursor: null }

  const followingIds = following.map((f: {following_id: string}) => f.following_id)

  // Of those, who also follows me back? (mutuals)
  const { data: followers, error: followersErr } = await supabase
    .from('follows').select('follower_id').eq('following_id', profile.id)
    .in('follower_id', followingIds)
  if (followersErr) console.error('[getMutualsFeedAction] followers query failed:', followersErr.message)

  const mutualIds = (followers || []).map((f: {follower_id: string}) => f.follower_id)
  if (!mutualIds.length) return { posts: [], nextCursor: null }

  let query = supabase
    .from('posts')
    .select(`
      id, body, post_type, likes_count, comments_count, reposts_count,
      bookmarks_count, impressions_count, link_clicks_count, detail_expands_count, video_views_count, video_completions_count, created_at, edited_at, is_sensitive, is_pinned, quoted_post_id, is_selling,
      author:users!posts_user_id_fkey(
        id, username, display_name, avatar_url, verification_tier, is_monetised
      ),
      media:post_media(id, media_type, url, thumbnail_url, width, height, position)
    `)
    .is('deleted_at', null)
    .is('parent_post_id', null)
    // See the identical note in getForYouFeedAction above - excluding
    // reposts here made them invisible in this feed too.
    .in('user_id', mutualIds)
    .lte('created_at', nowIso())
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (cursor) query = query.lt('created_at', cursor)

  const { data: posts, error: postsErr } = await query
  if (postsErr) console.error('[getMutualsFeedAction] posts query failed:', postsErr.message)
  const rawPosts = asRawRows(posts)
  if (!rawPosts.length) return { posts: [], nextCursor: null }

  const hasMore = rawPosts.length > PAGE_SIZE
  const page = hasMore ? rawPosts.slice(0, PAGE_SIZE) : rawPosts
  const nextCursor = hasMore ? page[page.length - 1].created_at : null

  return { posts: await hydrateEngagement(supabase, profile.id, spaceOutSellingPosts(page)), nextCursor }
}

// ─── Replies for a post ───────────────────────────────────────────────────────

export async function getPostRepliesAction(postId: string, cursor?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const profile = user
    ? (await supabase.from('users').select('id').eq('auth_id', user.id).single()).data
    : null

  let query = supabase
    .from('posts')
    .select(`
      id, body, post_type, likes_count, comments_count, reposts_count,
      bookmarks_count, impressions_count, link_clicks_count, detail_expands_count, video_views_count, video_completions_count, created_at, edited_at, is_sensitive, is_pinned, quoted_post_id, is_selling,
      author:users!posts_user_id_fkey(
        id, username, display_name, avatar_url, verification_tier, is_monetised
      ),
      media:post_media(id, media_type, url, thumbnail_url, width, height, position)
    `)
    .eq('parent_post_id', postId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(PAGE_SIZE + 1)

  if (cursor) query = query.gt('created_at', cursor)

  const { data: posts } = await query
  const rawPosts = asRawRows(posts)
  if (!rawPosts.length) return { posts: [], nextCursor: null }

  const hasMore = rawPosts.length > PAGE_SIZE
  const page = hasMore ? rawPosts.slice(0, PAGE_SIZE) : rawPosts
  const nextCursor = hasMore ? page[page.length - 1].created_at : null

  const hydrated = profile
    ? await hydrateEngagement(supabase, profile.id, page)
    : page.map(p => ({ ...p, is_liked: false, is_reposted: false, is_bookmarked: false })) as FeedPost[]

  return { posts: hydrated, nextCursor }
}

// ─── Bookmarked posts ─────────────────────────────────────────────────────────

export async function getBookmarkedPostsAction(cursor?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { posts: [], nextCursor: null }

  const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return { posts: [], nextCursor: null }

  let query = supabase
    .from('bookmarks')
    .select(`
      post:posts(
        id, body, post_type, likes_count, comments_count, reposts_count,
        bookmarks_count, impressions_count, link_clicks_count, detail_expands_count, video_views_count, video_completions_count, created_at, edited_at, is_sensitive, is_pinned, quoted_post_id, is_selling,
        author:users!posts_user_id_fkey(
          id, username, display_name, avatar_url, verification_tier, is_monetised
        ),
        media:post_media(id, media_type, url, thumbnail_url, width, height, position)
      )
    `)
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (cursor) query = query.lt('created_at', cursor)

  const { data: rows } = await query
  if (!rows?.length) return { posts: [], nextCursor: null }

  const hasMore = rows.length > PAGE_SIZE
  const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  const page = pageRows.map((r: any) => r.post).filter(Boolean) as RawFeedRow[]
  const nextCursor = hasMore ? (pageRows[pageRows.length - 1] as any)?.created_at : null

  return {
    posts: page.map((p): FeedPost => ({ ...p, is_liked: false, is_reposted: false, is_bookmarked: true, quoted_post: null })),
    nextCursor,
  }
}

// ─── Profile tab feed ─────────────────────────────────────────────────────────
// Loads posts for a specific profile + tab (posts / replies / media / likes)
// with engagement state hydrated for the current viewer.

export async function getProfileTabAction(
  profileUserId: string,
  tab: 'posts' | 'replies' | 'media' | 'likes',
  cursor?: string
): Promise<{ posts: FeedPost[]; nextCursor: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const viewer = user
    ? (await supabase.from('users').select('id').eq('auth_id', user.id).single()).data
    : null

  const BASE_SELECT = `
    id, body, post_type, likes_count, comments_count, reposts_count,
    bookmarks_count, impressions_count, link_clicks_count, detail_expands_count, video_views_count, video_completions_count, created_at, edited_at, is_sensitive, is_pinned, quoted_post_id, is_selling,
    author:users!posts_user_id_fkey(
      id, username, display_name, avatar_url, verification_tier, is_monetised
    ),
    media:post_media(id, media_type, url, thumbnail_url, width, height, position)
  `

  // media tab uses !inner to only return posts that have at least one media row
  const MEDIA_SELECT = `
    id, body, post_type, likes_count, comments_count, reposts_count,
    bookmarks_count, impressions_count, link_clicks_count, detail_expands_count, video_views_count, video_completions_count, created_at, edited_at, is_sensitive, is_pinned, quoted_post_id, is_selling,
    author:users!posts_user_id_fkey(
      id, username, display_name, avatar_url, verification_tier, is_monetised
    ),
    media:post_media!inner(id, media_type, url, thumbnail_url, width, height, position)
  `

  let rawPosts: RawFeedRow[] = []
  let hasMore = false

  if (tab === 'likes') {
    let q = supabase
      .from('likes')
      .select(`post:posts(${BASE_SELECT})`)
      .eq('user_id', profileUserId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1)
    if (cursor) q = q.lt('created_at', cursor)
    const { data } = await q
    const rows = data || []
    hasMore = rows.length > PAGE_SIZE
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows
    rawPosts = page.map((r: any) => r.post).filter(Boolean) as RawFeedRow[]
  } else {
    let q = supabase
      .from('posts')
      .select(tab === 'media' ? MEDIA_SELECT : BASE_SELECT)
      .eq('user_id', profileUserId)
      .is('deleted_at', null)
      .lte('created_at', nowIso())  // scheduled posts stay off the profile too - even the owner's own
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1)

    if (tab === 'posts') {
      q = q.is('parent_post_id', null).neq('post_type', 'repost')
      // Pinned post first, then chronological — only on first page
      if (!cursor) {
        q = q.order('is_pinned', { ascending: false }).order('created_at', { ascending: false })
      }
    } else if (tab === 'replies') {
      q = q.not('parent_post_id', 'is', null)
    }
    // media: no extra filter — !inner join handles it

    if (cursor) q = q.lt('created_at', cursor)
    const { data } = await q
    const rows = asRawRows(data)
    hasMore = rows.length > PAGE_SIZE
    rawPosts = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  }

  const nextCursor = hasMore ? rawPosts[rawPosts.length - 1]?.created_at ?? null : null

  const hydrated = viewer
    ? await hydrateEngagement(supabase, viewer.id, rawPosts)
    : rawPosts.map((p): FeedPost => ({ ...p, is_liked: false, is_reposted: false, is_bookmarked: false, quoted_post: null }))

  return { posts: hydrated, nextCursor }
}

// ─── Profile mutuals list ─────────────────────────────────────────────────────
// Returns users who mutually follow each other with the given profile user.
// Used by the "Mutuals" tab on profile pages.

export interface MutualUser {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  verification_tier: string
  followers_count: number
  is_monetised: boolean
}

export async function getProfileMutualsAction(profileUserId: string): Promise<MutualUser[]> {
  const supabase = await createClient()

  // Everyone profileUser follows
  const { data: following } = await supabase
    .from('follows').select('following_id').eq('follower_id', profileUserId)
  if (!following?.length) return []

  const followingIds = following.map((f: { following_id: string }) => f.following_id)

  // Of those, who also follows profileUser back?
  const { data: mutualFollows } = await supabase
    .from('follows').select('follower_id')
    .eq('following_id', profileUserId)
    .in('follower_id', followingIds)
  if (!mutualFollows?.length) return []

  const mutualIds = mutualFollows.map((f: { follower_id: string }) => f.follower_id)

  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, verification_tier, followers_count, is_monetised')
    .in('id', mutualIds)
    .is('deleted_at', null)
    .order('followers_count', { ascending: false })
    .limit(50)

  return (users || []) as MutualUser[]
}

// ─── Posts by id, in the order given ──────────────────────────────────────────
// Used by the notifications "New posts" view: it already knows WHICH posts
// (from the notifications, in the order they came in) and needs them fully
// hydrated so they render exactly like feed posts.

export async function getPostsByIdsAction(ids: string[]): Promise<FeedPost[]> {
  const unique = [...new Set(ids)].slice(0, 100)
  if (!unique.length) return []

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return []

  const { data: posts } = await supabase
    .from('posts')
    .select(`
      id, body, post_type, likes_count, comments_count, reposts_count,
      bookmarks_count, impressions_count, link_clicks_count, detail_expands_count, video_views_count, video_completions_count, created_at, edited_at, is_sensitive, is_pinned, quoted_post_id, is_selling,
      author:users!posts_user_id_fkey(
        id, username, display_name, avatar_url, verification_tier, is_monetised
      ),
      media:post_media(id, media_type, url, thumbnail_url, width, height, position)
    `)
    .in('id', unique)
    .is('deleted_at', null)
    .lte('created_at', nowIso())

  const rawPosts = asRawRows(posts)
  if (!rawPosts.length) return []
  const hydrated = await hydrateEngagement(supabase, profile.id, rawPosts)
  const byId = new Map(hydrated.map(p => [p.id, p]))
  return unique.map(id => byId.get(id)).filter(Boolean) as FeedPost[]
}

// ─── Internal: batch-hydrate like/repost/bookmark state ──────────────────────

async function hydrateEngagement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  posts: RawFeedRow[]
): Promise<FeedPost[]> {
  if (!posts.length) return []
  const ids = posts.map(p => p.id)

  // Collect quoted_post_ids that need hydrating (quote posts + reposts)
  const quotedIds = [...new Set(
    posts.map(p => p.quoted_post_id).filter(Boolean)
  )] as string[]

  const [{ data: likes }, { data: bookmarks }, { data: reposts }, { data: quotedPosts }] = await Promise.all([
    supabase.from('likes').select('post_id').eq('user_id', userId).in('post_id', ids),
    supabase.from('bookmarks').select('post_id').eq('user_id', userId).in('post_id', ids),
    supabase.from('posts').select('quoted_post_id').eq('user_id', userId).eq('post_type', 'repost').in('quoted_post_id', ids),
    quotedIds.length
      ? supabase.from('posts').select(`
          id, body, created_at, is_selling,
          author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier),
          media:post_media(id, media_type, url, thumbnail_url, width, height, position)
        `).in('id', quotedIds)
      : Promise.resolve({ data: [] }),
  ])

  const likedSet = new Set((likes || []).map((l: {post_id: string}) => l.post_id))
  const bookmarkedSet = new Set((bookmarks || []).map((b: {post_id: string}) => b.post_id))
  const repostedSet = new Set((reposts || []).map((r: {quoted_post_id: string}) => r.quoted_post_id))
  const quotedMap = new Map((quotedPosts || []).map((q: any) => [q.id, q]))

  return posts.map((p): FeedPost => ({
    ...p,
    is_liked: likedSet.has(p.id),
    is_bookmarked: bookmarkedSet.has(p.id),
    is_reposted: repostedSet.has(p.id),
    quoted_post: p.quoted_post_id ? (quotedMap.get(p.quoted_post_id) ?? null) : null,
  }))
}