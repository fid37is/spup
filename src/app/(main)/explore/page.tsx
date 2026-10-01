// src/app/(main)/explore/page.tsx
//
// Explore page — Twitter-style top-level category tabs + search.
//
// Top-level tabs (no search):
//   For You      → posts matching the current user's saved interests
//   Trending     → top hashtags + hot posts from last 48 hrs
//   News         → posts tagged with News/Finance/Career interest IDs
//   Sports       → posts tagged with Sports interest IDs
//   Entertainment→ posts tagged with Entertainment/Creative interest IDs
//   Jobs         → vacancies and employment posts (hashtags + wording)
//
// Every topic tab matches a post by hashtag OR by wording (see
// lib/explore-topics.ts), so posts show up even when nobody typed the exact tag.
//
// Search state (query present):
//   Posts / People / Hashtags tabs — same as before
//
// All content comes from the DB. The only hardcoded things are:
//   - Tab names and which NIGERIAN_INTERESTS categories they cover (config, not data)
//   - avatarBg colour palette (design constant)

import React from 'react'
import { createClient } from '@/lib/supabase/server'
import { formatNumber, formatRelativeTime } from '@/lib/utils'
import { NIGERIAN_INTERESTS } from '@/types'
import { INTEREST_TOPICS, TAB_EXTRAS, JOBS_TOPIC, mergeTopics, type ExploreTopic } from '@/lib/explore-topics'
import PostCard from '@/components/feed/post-card'
import Link from 'next/link'
import ExploreSearchInput from './search-input'
import { getSuggestedUsers } from '@/lib/queries/users'
import { getMatchdayFixtures } from '@/lib/queries/matchday'
import MatchdayStrip from '@/components/explore/matchday-strip'
import { UserCard, avatarBg, type UserResult } from '@/components/explore/user-card'
import {
  TrendingUp, Users, Hash,
  Flame, ArrowUpRight, Search, UserRound, Newspaper,
  Trophy, Clapperboard, Sparkles, Briefcase,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Supabase = Awaited<ReturnType<typeof createClient>>

interface TrendingTag { tag: string; posts_count: number }

// ─── Tab config ───────────────────────────────────────────────────────────────
// Maps each top-level tab to the NIGERIAN_INTERESTS category names it covers.
// Interest IDs (e.g. 'football', 'tech') double as hashtag tags in the DB.

const EXPLORE_TABS = [
  { key: 'for-you', label: 'Explore', icon: Sparkles, categories: null },
  { key: 'trending', label: 'Trending', icon: TrendingUp, categories: null },
  { key: 'news', label: 'News', icon: Newspaper, categories: ['News', 'Finance', 'Career'] },
  { key: 'sports', label: 'Sports', icon: Trophy, categories: ['Sports'] },
  { key: 'entertainment', label: 'Entertainment', icon: Clapperboard, categories: ['Entertainment', 'Creative', 'Lifestyle'] },
  { key: 'jobs', label: 'Jobs', icon: Briefcase, categories: null },
] as const

type ExploreTabKey = typeof EXPLORE_TABS[number]['key']

// Search-result sub-tabs
const SEARCH_TABS = [
  { key: 'posts', label: 'Posts' },
  { key: 'people', label: 'People' },
  { key: 'hashtags', label: 'Hashtags' },
] as const
type SearchTabKey = typeof SEARCH_TABS[number]['key']

// ─── Shared select ────────────────────────────────────────────────────────────

const POST_SELECT = `
  id, body, post_type, likes_count, comments_count, reposts_count,
  bookmarks_count, impressions_count, created_at, edited_at, is_sensitive, quoted_post_id,
  author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier, is_monetised),
  media:post_media(id, media_type, url, thumbnail_url, width, height, position)
`

// ─── Data fetchers ────────────────────────────────────────────────────────────

/** Batch-hydrate like/bookmark/repost. Mirrors feed.ts exactly. */
async function hydrateEngagement(db: Supabase, userId: string, posts: any[]) {
  if (!posts.length) return []
  const ids = posts.map((p: any) => p.id)
  const [{ data: likes }, { data: bookmarks }, { data: reposts }] = await Promise.all([
    db.from('likes').select('post_id').eq('user_id', userId).in('post_id', ids),
    db.from('bookmarks').select('post_id').eq('user_id', userId).in('post_id', ids),
    db.from('posts').select('quoted_post_id').eq('user_id', userId).eq('post_type', 'repost').in('quoted_post_id', ids),
  ])
  const likedSet = new Set((likes || []).map((r: any) => r.post_id))
  const bookmarkedSet = new Set((bookmarks || []).map((r: any) => r.post_id))
  const repostedSet = new Set((reposts || []).map((r: any) => r.quoted_post_id))
  return posts.map((p: any) => ({
    ...p,
    is_liked: likedSet.has(p.id),
    is_bookmarked: bookmarkedSet.has(p.id),
    is_reposted: repostedSet.has(p.id),
  }))
}

function noEngagement(posts: any[]) {
  return posts.map((p: any) => ({ ...p, is_liked: false, is_reposted: false, is_bookmarked: false }))
}

/**
 * People this viewer has blocked or muted. Explore must hide them exactly like the
 * feed does (lib/actions/feed.ts) - they were never filtered here, so a blocked
 * user's posts kept turning up in every tab and in search.
 */
async function getHiddenIds(db: Supabase, profileId: string | null): Promise<string[]> {
  if (!profileId) return []
  const [{ data: blocks }, { data: mutes }] = await Promise.all([
    db.from('user_blocks').select('blocked_id').eq('blocker_id', profileId),
    db.from('user_mutes').select('muted_id').eq('muter_id', profileId),
  ])
  return Array.from(new Set([
    ...(blocks || []).map((b: any) => b.blocked_id as string),
    ...(mutes || []).map((m: any) => m.muted_id as string),
  ]))
}

/** Drops posts written by hidden users (for queries where the filter can't be done in SQL). */
function withoutHidden(posts: any[], hidden: string[]) {
  if (!hidden.length) return posts
  const set = new Set(hidden)
  return posts.filter((p: any) => !set.has(p.author?.id))
}

/**
 * Posts that belong to a topic: carry one of its hashtags OR contain one of its
 * words. The match runs in Postgres (explore_topic_post_ids); this loads the
 * full rows for the ids it returns and keeps their newest-first order.
 */
async function getTopicPosts(
  db: Supabase, topics: ExploreTopic[], profileId: string | null,
  { days = 30, limit = 30, hidden = [] }: { days?: number; limit?: number; hidden?: string[] } = {},
) {
  const { tags, pattern } = mergeTopics(topics)
  if (!tags.length && !pattern) return []

  const { data: idRows, error } = await db.rpc('explore_topic_post_ids', {
    p_tags: tags, p_pattern: pattern, p_days: days, p_limit: limit, p_exclude: hidden,
  })
  if (error) { console.error('explore_topic_post_ids failed:', error.message); return [] }
  const ids: string[] = (idRows || []).map((r: any) => r.id as string)
  if (!ids.length) return []

  const { data: rows } = await db.from('posts').select(POST_SELECT).in('id', ids)
  const byId = new Map<string, any>((rows || []).map((p: any) => [p.id as string, p]))
  const posts = ids.map((id: string) => byId.get(id)).filter(Boolean) as any[]
  if (!posts.length) return []
  return profileId ? hydrateEngagement(db, profileId, posts) : noEngagement(posts)
}

function topicsForInterests(interestIds: readonly string[]): ExploreTopic[] {
  return interestIds.map(id => INTEREST_TOPICS[id]).filter(Boolean)
}

/** For You: posts matching the user's saved interests, topped up with hot posts so it is never empty. */
async function getForYouPosts(db: Supabase, profileId: string | null, hidden: string[]) {
  if (!profileId) return getHotPosts(db, null, hidden)

  const { data: saved } = await db.from('user_interests').select('interest').eq('user_id', profileId)
  const interestIds = (saved || []).map((r: any) => r.interest as string)
  if (!interestIds.length) return getHotPosts(db, profileId, hidden)

  const matched = await getTopicPosts(db, topicsForInterests(interestIds), profileId, { limit: 30, hidden })
  if (matched.length >= 15) return matched

  const seen = new Set(matched.map((p: any) => p.id))
  const hot = (await getHotPosts(db, profileId, hidden)).filter((p: any) => !seen.has(p.id))
  return [...matched, ...hot].slice(0, 30)
}

/** Category tab: the tab's interests plus the tab's own extra tags and words. */
async function getCategoryPosts(db: Supabase, tabKey: string, categories: readonly string[], profileId: string | null, hidden: string[]) {
  const interestIds = NIGERIAN_INTERESTS.filter(i => categories.includes(i.category)).map(i => i.id)
  const topics = topicsForInterests(interestIds)
  if (TAB_EXTRAS[tabKey]) topics.push(TAB_EXTRAS[tabKey])
  return getTopicPosts(db, topics, profileId, { limit: 30, hidden })
}

/** Jobs tab: vacancies and employment posts. */
async function getJobPosts(db: Supabase, profileId: string | null, hidden: string[]) {
  return getTopicPosts(db, [JOBS_TOPIC], profileId, { days: 45, limit: 40, hidden })
}

/** Hot posts: most-liked in the last 7 days, newest first among ties. */
async function getHotPosts(db: Supabase, profileId: string | null, hidden: string[] = []) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: raw } = await db
    .from('posts')
    .select(POST_SELECT)
    .is('deleted_at', null)
    .is('parent_post_id', null)
    .neq('post_type', 'repost')
    .gte('created_at', since)
    .order('likes_count', { ascending: false })
    .order('created_at', { ascending: false })
    .lte('created_at', new Date().toISOString())
    .limit(20)
  const posts = withoutHidden(raw || [], hidden)
  if (!posts.length) return []
  if (!profileId) return noEngagement(posts)
  return hydrateEngagement(db, profileId, posts)
}

async function getTrending(db: Supabase): Promise<TrendingTag[]> {
  const { data } = await db
    .from('hashtags')
    .select('tag, posts_count')
    .gt('posts_count', 0)
    .order('posts_count', { ascending: false })
    .limit(10)
  return (data || []) as TrendingTag[]
}

async function getSuggestedPeople(db: Supabase, profileId: string, hidden: string[]): Promise<UserResult[]> {
  const { data: follows } = await db.from('follows').select('following_id').eq('follower_id', profileId)
  const excludeIds = [profileId, ...hidden, ...((follows || []).map((f: any) => f.following_id))]
  // Blends newest accounts in with the most-followed ones so new users
  // actually get discovered instead of being buried under everyone
  // who already has followers — see lib/queries/users.ts.
  return getSuggestedUsers(excludeIds, 5) as Promise<UserResult[]>
}

// ─── Search fetchers ──────────────────────────────────────────────────────────

async function searchPosts(db: Supabase, query: string, profileId: string | null, hidden: string[]) {
  const isHashtag = query.startsWith('#')
  const term = isHashtag ? query.slice(1).toLowerCase() : query
  let rawPosts: any[] = []

  if (isHashtag) {
    const { data: tagRow } = await db.from('hashtags').select('id').eq('tag', term).maybeSingle()
    if (tagRow) {
      const { data } = await db.from('post_hashtags').select(`post:posts(${POST_SELECT})`).eq('hashtag_id', tagRow.id).limit(30)
      rawPosts = (data || []).map((r: any) => r.post).filter(Boolean)
    }
  } else {
    const { data } = await db.from('posts').select(POST_SELECT)
      .textSearch('body', term, { type: 'websearch', config: 'english' })
      .is('deleted_at', null).order('created_at', { ascending: false }).limit(30)
    rawPosts = data || []
  }

  rawPosts = withoutHidden(rawPosts, hidden)
  if (!rawPosts.length || !profileId) return noEngagement(rawPosts)
  return hydrateEngagement(db, profileId, rawPosts)
}

async function searchUsers(db: Supabase, query: string): Promise<UserResult[]> {
  const term = query.startsWith('#') ? query.slice(1) : query
  const { data } = await db.from('users')
    .select('id, username, display_name, avatar_url, verification_tier, followers_count, bio, is_monetised')
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .is('deleted_at', null)
    .neq('status', 'banned')
    .neq('role', 'admin')
    .not('username', 'is', null)
    .order('followers_count', { ascending: false }).limit(20)
  return (data || []) as UserResult[]
}

async function searchHashtags(db: Supabase, query: string): Promise<TrendingTag[]> {
  const term = query.startsWith('#') ? query.slice(1) : query
  const { data } = await db.from('hashtags').select('tag, posts_count')
    .ilike('tag', `%${term}%`).order('posts_count', { ascending: false }).limit(20)
  return (data || []) as TrendingTag[]
}

// ─── UI components ────────────────────────────────────────────────────────────

function HeadlineRow({ p, categoryLabel }: { p: any; categoryLabel: string }) {
  const author = p.author || {}
  const initials = author.display_name?.slice(0, 2).toUpperCase() || 'SP'
  const engagement = (p.likes_count || 0) + (p.comments_count || 0) + (p.reposts_count || 0)
  return (
    <Link
      href={`/post/${p.id}`}
      style={{ textDecoration: 'none', display: 'block', padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}
    >
      <p style={{
        fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)', margin: '0 0 8px', lineHeight: 1.3,
        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>
        {p.body || 'Shared a post'}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-secondary)' }}>
        <div style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
          background: author.avatar_url ? 'transparent' : avatarBg(author.username || 'sp'),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8, fontWeight: 800, color: 'white',
        }}>
          {author.avatar_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={author.avatar_url} alt={author.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initials}
        </div>
        <span>{formatRelativeTime(p.created_at)} · {categoryLabel} · {formatNumber(engagement)} {engagement === 1 ? 'interaction' : 'interactions'}</span>
      </div>
    </Link>
  )
}

function HashtagRow({ t, rank }: { t: TrendingTag; rank?: number }) {
  return (
    <Link href={`/explore?q=${encodeURIComponent('#' + t.tag)}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderBottom: '1px solid var(--color-border)' }}>
      {rank !== undefined
        ? <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: rank === 0 ? 'var(--color-brand-muted)' : 'var(--color-surface-2)', border: `1px solid ${rank === 0 ? 'var(--color-brand-border)' : 'var(--color-border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: rank === 0 ? 'var(--color-brand)' : 'var(--color-text-muted)' }}>{rank + 1}</div>
        : <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'var(--color-brand-muted)', border: '1px solid var(--color-brand-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Hash size={13} color="var(--color-brand)" /></div>
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Trending</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>#{t.tag}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{formatNumber(t.posts_count)} posts</div>
      </div>
      <TrendingUp size={14} style={{ color: 'var(--color-text-faint)', flexShrink: 0 }} />
    </Link>
  )
}

function SectionHeader({ icon: Icon, title, seeAllHref }: { icon: React.ElementType; title: string; seeAllHref?: string }) {
  return (
    <div style={{ padding: '16px 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={15} color="var(--color-brand)" />
        <h2 style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', margin: 0 }}>{title}</h2>
      </div>
      {seeAllHref && (
        <Link href={seeAllHref} style={{ fontSize: 12, color: 'var(--color-brand)', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
          See all <ArrowUpRight size={12} />
        </Link>
      )}
    </div>
  )
}

function EmptyState({ Icon, title, sub }: { Icon: React.ElementType; title: string; sub: string }) {
  return (
    <div style={{ padding: '60px 20px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={22} color="var(--color-text-muted)" />
        </div>
      </div>
      <h3 style={{ fontWeight: 700, fontSize: 17, color: 'var(--color-text-primary)', marginBottom: 8 }}>{title}</h3>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', maxWidth: 260, margin: '0 auto' }}>{sub}</p>
    </div>
  )
}

// ─── Top-level explore tab bar ────────────────────────────────────────────────

function ExploreTabBar({ activeTab, query }: { activeTab: ExploreTabKey; query: string }) {
  return (
    <div style={{
      display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--color-border)',
      // Hide scrollbar
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
    }}>
      {EXPLORE_TABS.map(tab => {
        const active = activeTab === tab.key
        return (
          <Link
            key={tab.key}
            href={`/explore?etab=${tab.key}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
            style={{
              flex: '0 0 auto',
              padding: '14px 18px',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: active ? 700 : 500,
              color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              borderBottom: active ? '2px solid var(--color-brand)' : '2px solid transparent',
              whiteSpace: 'nowrap',
              transition: 'color 0.12s',
            }}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}

// ─── Search sub-tab bar ───────────────────────────────────────────────────────

function SearchTabBar({ query, activeTab, counts }: { query: string; activeTab: SearchTabKey; counts: Record<SearchTabKey, number> }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '12px 20px', borderBottom: '1px solid var(--color-border)', overflowX: 'auto' }}>
      {SEARCH_TABS.map(tab => {
        const active = activeTab === tab.key
        return (
          <Link key={tab.key} href={`/explore?q=${encodeURIComponent(query)}&tab=${tab.key}`} style={{ padding: '7px 16px', borderRadius: 20, textDecoration: 'none', fontSize: 13, fontWeight: 600, background: active ? 'var(--color-brand)' : 'var(--color-surface-2)', color: active ? 'white' : 'var(--color-text-secondary)', border: `1px solid ${active ? 'var(--color-brand)' : 'var(--color-border)'}`, whiteSpace: 'nowrap' }}>
            {tab.label}
            {counts[tab.key] > 0 && <span style={{ opacity: 0.8, marginLeft: 5 }}>({counts[tab.key]})</span>}
          </Link>
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface SP { q?: string; tab?: string; etab?: string }

export default async function ExplorePage({ searchParams }: { searchParams: Promise<SP> }) {
  const params = await searchParams
  const query = params.q?.trim() || ''
  const etab: ExploreTabKey = EXPLORE_TABS.some(t => t.key === params.etab) ? (params.etab as ExploreTabKey) : 'for-you'
  const searchTab = (params.tab as SearchTabKey) || 'posts'

  const db = await createClient()

  const { data: { user } } = await db.auth.getUser()
  let profileId: string | null = null
  let followingIdSet = new Set<string>()
  let followerIdSet = new Set<string>()
  if (user) {
    const { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
    profileId = profile?.id ?? null
    if (profileId) {
      const [{ data: followingRows }, { data: followerRows }] = await Promise.all([
        db.from('follows').select('following_id').eq('follower_id', profileId),
        db.from('follows').select('follower_id').eq('following_id', profileId),
      ])
      followingIdSet = new Set((followingRows || []).map((r: any) => r.following_id as string))
      followerIdSet = new Set((followerRows || []).map((r: any) => r.follower_id as string))
    }
  }
  const hidden = await getHiddenIds(db, profileId)

  // Only needed for the browse/discovery tabs — skip the fetch entirely
  // when the person is searching.
  const fixtures = query ? [] : await getMatchdayFixtures()

  // ─── Sticky header: search bar + explore tabs ──────────────────────────────
  const StickyHeader = (
    <div style={{ position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(20px)', background: 'var(--nav-bg)' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <ExploreSearchInput defaultValue={query} />
      </div>
      {!query && <ExploreTabBar activeTab={etab} query="" />}
    </div>
  )

  // ─── Search state ──────────────────────────────────────────────────────────
  if (query) {
    const [postResults, userResults, hashtagResults] = await Promise.all([
      searchPosts(db, query, profileId, hidden),
      searchUsers(db, query),
      searchHashtags(db, query),
    ])
    const counts: Record<SearchTabKey, number> = {
      posts: postResults.length,
      people: userResults.length,
      hashtags: hashtagResults.length,
    }
    const total = counts.posts + counts.people + counts.hashtags

    return (
      <div>
        <div style={{ position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(20px)', background: 'var(--nav-bg)', borderBottom: '1px solid var(--color-border)', padding: '12px 20px' }}>
          <ExploreSearchInput defaultValue={query} />
        </div>
        <div style={{ padding: '12px 20px 0' }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
            {total === 0 ? 'No results for ' : `${total.toLocaleString()} result${total !== 1 ? 's' : ''} for `}
            <strong style={{ color: 'var(--color-text-primary)' }}>&ldquo;{query}&rdquo;</strong>
          </p>
          <SearchTabBar query={query} activeTab={searchTab} counts={counts} />
        </div>
        {searchTab === 'posts' && (postResults.length === 0 ? <EmptyState Icon={Search} title="No posts found" sub={`No posts match "${query}". Try different keywords or search a #hashtag.`} /> : postResults.map((p: any) => <PostCard key={p.id} post={p} />))}
        {searchTab === 'people' && (userResults.length === 0 ? <EmptyState Icon={UserRound} title="No people found" sub={`No accounts match "${query}".`} /> : userResults.map(u => (
          <UserCard key={u.id} u={u} showFollow={!!profileId} initialFollowing={followingIdSet.has(u.id)} followsMe={followerIdSet.has(u.id)} />
        )))}
        {searchTab === 'hashtags' && (hashtagResults.length === 0 ? <EmptyState Icon={Hash} title="No hashtags found" sub={`No hashtags match "${query}".`} /> : hashtagResults.map(t => <HashtagRow key={t.tag} t={t} />))}
      </div>
    )
  }

  // ─── No-search: explore tabs ───────────────────────────────────────────────

  // For You tab
  if (etab === 'for-you') {
    const [forYouPosts, suggestedPeople] = await Promise.all([
      getForYouPosts(db, profileId, hidden),
      profileId ? getSuggestedPeople(db, profileId, hidden) : Promise.resolve([]),
    ])
    return (
      <div>
        {StickyHeader}
        <MatchdayStrip fixtures={fixtures} />
        {forYouPosts.length === 0
          ? <EmptyState Icon={Sparkles} title="Nothing here yet" sub="Follow people and select interests during onboarding to personalise your feed." />
          : (
            <div style={{ borderBottom: '1px solid var(--color-border)' }}>
              <SectionHeader icon={Sparkles} title="Today's Posts" />
              {forYouPosts.map((p: any) => <HeadlineRow key={p.id} p={p} categoryLabel="Explore" />)}
            </div>
          )
        }
        {suggestedPeople.length > 0 && (
          <div style={{ borderTop: '1px solid var(--color-border)' }}>
            <SectionHeader icon={Users} title="Who to follow" seeAllHref="/explore/people" />
            {suggestedPeople.map(u => (
              <UserCard key={u.id} u={u} showFollow initialFollowing={false} followsMe={followerIdSet.has(u.id)} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Trending tab
  if (etab === 'trending') {
    const [hotPosts, trending] = await Promise.all([
      getHotPosts(db, profileId, hidden),
      getTrending(db),
    ])
    return (
      <div>
        {StickyHeader}
        <MatchdayStrip fixtures={fixtures} />
        {hotPosts.length > 0 && (
          <div style={{ borderBottom: '1px solid var(--color-border)' }}>
            <SectionHeader icon={Flame} title="Hot right now" />
            {hotPosts.map((p: any) => <HeadlineRow key={p.id} p={p} categoryLabel="Trending" />)}
          </div>
        )}
        {trending.length > 0 && (
          <div>
            <SectionHeader icon={TrendingUp} title="Trending topics" />
            {trending.map((t, i) => <HashtagRow key={t.tag} t={t} rank={i} />)}
          </div>
        )}
        {hotPosts.length === 0 && trending.length === 0 && (
          <EmptyState Icon={TrendingUp} title="Nothing trending yet" sub="As people post and engage, trending topics will appear here." />
        )}
      </div>
    )
  }

  // Jobs tab - full post cards so the role, requirements and how to apply are readable in place
  if (etab === 'jobs') {
    const jobPosts = await getJobPosts(db, profileId, hidden)
    return (
      <div>
        {StickyHeader}
        {jobPosts.length === 0
          ? <EmptyState Icon={Briefcase} title="No job posts yet" sub="Posts about vacancies and hiring show up here. Use #hiring or #jobs when you post an opening." />
          : (
            <div>
              <SectionHeader icon={Briefcase} title="Jobs & opportunities" />
              {jobPosts.map((p: any) => <PostCard key={p.id} post={p} />)}
            </div>
          )
        }
      </div>
    )
  }

  // News / Sports / Entertainment tabs
  const tabConfig = EXPLORE_TABS.find(t => t.key === etab)
  if (tabConfig && tabConfig.categories) {
    const posts = await getCategoryPosts(db, tabConfig.key, tabConfig.categories, profileId, hidden)
    const TabIcon = tabConfig.icon
    return (
      <div>
        {StickyHeader}
        <MatchdayStrip fixtures={fixtures} />
        {posts.length === 0
          ? <EmptyState Icon={TabIcon} title={`No ${tabConfig.label} posts yet`} sub={`Be the first to post about ${tabConfig.label.toLowerCase()} topics and they'll appear here.`} />
          : (
            <div>
              <SectionHeader icon={TabIcon} title={`Today's ${tabConfig.label}`} />
              {posts.map((p: any) => <HeadlineRow key={p.id} p={p} categoryLabel={tabConfig.label} />)}
            </div>
          )
        }
      </div>
    )
  }

  // Fallback (shouldn't be reached)
  return <div>{StickyHeader}</div>
}