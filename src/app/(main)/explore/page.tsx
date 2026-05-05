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
//
// Search state (query present):
//   Posts / People / Hashtags tabs — same as before
//
// All content comes from the DB. The only hardcoded things are:
//   - Tab names and which NIGERIAN_INTERESTS categories they cover (config, not data)
//   - avatarBg colour palette (design constant)

import React from 'react'
import { createClient } from '@/lib/supabase/server'
import { formatNumber } from '@/lib/utils'
import { NIGERIAN_INTERESTS } from '@/types'
import PostCard from '@/components/feed/post-card'
import Link from 'next/link'
import ExploreSearchInput from './search-input'
import {
  BadgeCheck, Star, TrendingUp, Users, Hash,
  Flame, ArrowUpRight, Search, UserRound, Newspaper,
  Trophy, Clapperboard, Sparkles,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Supabase = Awaited<ReturnType<typeof createClient>>

interface TrendingTag  { tag: string; posts_count: number }
interface UserResult {
  id: string; username: string; display_name: string
  avatar_url: string | null; verification_tier: string
  followers_count: number; bio: string | null; is_monetised: boolean
}

// ─── Tab config ───────────────────────────────────────────────────────────────
// Maps each top-level tab to the NIGERIAN_INTERESTS category names it covers.
// Interest IDs (e.g. 'football', 'tech') double as hashtag tags in the DB.

const EXPLORE_TABS = [
  { key: 'for-you',       label: 'For You',       icon: Sparkles,     categories: null                                         },
  { key: 'trending',      label: 'Trending',      icon: TrendingUp,   categories: null                                         },
  { key: 'news',          label: 'News',          icon: Newspaper,    categories: ['News', 'Finance', 'Career']                },
  { key: 'sports',        label: 'Sports',        icon: Trophy,       categories: ['Sports']                                   },
  { key: 'entertainment', label: 'Entertainment', icon: Clapperboard, categories: ['Entertainment', 'Creative', 'Lifestyle']   },
] as const

type ExploreTabKey = typeof EXPLORE_TABS[number]['key']

// Search-result sub-tabs
const SEARCH_TABS = [
  { key: 'posts',    label: 'Posts'    },
  { key: 'people',  label: 'People'   },
  { key: 'hashtags', label: 'Hashtags' },
] as const
type SearchTabKey = typeof SEARCH_TABS[number]['key']

// ─── Shared select ────────────────────────────────────────────────────────────

const POST_SELECT = `
  id, body, post_type, likes_count, dislikes_count, comments_count, reposts_count,
  bookmarks_count, impressions_count, created_at, edited_at, is_sensitive, quoted_post_id,
  author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier, is_monetised),
  media:post_media(id, media_type, url, thumbnail_url, width, height, position)
`

// ─── Data fetchers ────────────────────────────────────────────────────────────

/** Batch-hydrate like/dislike/bookmark/repost. Mirrors feed.ts exactly. */
async function hydrateEngagement(db: Supabase, userId: string, posts: any[]) {
  if (!posts.length) return []
  const ids = posts.map((p: any) => p.id)
  const [{ data: likes }, { data: dislikes }, { data: bookmarks }, { data: reposts }] = await Promise.all([
    db.from('likes').select('post_id').eq('user_id', userId).in('post_id', ids),
    db.from('dislikes').select('post_id').eq('user_id', userId).in('post_id', ids),
    db.from('bookmarks').select('post_id').eq('user_id', userId).in('post_id', ids),
    db.from('posts').select('quoted_post_id').eq('user_id', userId).eq('post_type', 'repost').in('quoted_post_id', ids),
  ])
  const likedSet      = new Set((likes     || []).map((r: any) => r.post_id))
  const dislikedSet   = new Set((dislikes  || []).map((r: any) => r.post_id))
  const bookmarkedSet = new Set((bookmarks || []).map((r: any) => r.post_id))
  const repostedSet   = new Set((reposts   || []).map((r: any) => r.quoted_post_id))
  return posts.map((p: any) => ({
    ...p,
    is_liked:      likedSet.has(p.id),
    is_disliked:   dislikedSet.has(p.id),
    is_bookmarked: bookmarkedSet.has(p.id),
    is_reposted:   repostedSet.has(p.id),
  }))
}

function noEngagement(posts: any[]) {
  return posts.map((p: any) => ({ ...p, is_liked: false, is_disliked: false, is_reposted: false, is_bookmarked: false }))
}

/** Posts tagged with any of the given hashtag tags (interest IDs). */
async function getPostsByInterestIds(db: Supabase, interestIds: string[], profileId: string | null, limit = 20) {
  if (!interestIds.length) return []

  // Resolve hashtag UUIDs for these interest IDs
  const { data: tags } = await db
    .from('hashtags')
    .select('id')
    .in('tag', interestIds)

  const tagIds = (tags || []).map((t: any) => t.id)
  if (!tagIds.length) return []

  const { data: rows } = await db
    .from('post_hashtags')
    .select(`post:posts(${POST_SELECT})`)
    .in('hashtag_id', tagIds)
    .limit(limit)

  const posts = (rows || []).map((r: any) => r.post).filter(Boolean)
  if (!posts.length) return []
  if (!profileId) return noEngagement(posts)
  return hydrateEngagement(db, profileId, posts)
}

/** For You: posts tagged with the user's own saved interests. */
async function getForYouPosts(db: Supabase, profileId: string | null) {
  if (!profileId) {
    // Unauthenticated: fall back to hot posts
    return getHotPosts(db, null)
  }

  const { data: saved } = await db
    .from('user_interests')
    .select('interest')
    .eq('user_id', profileId)

  const interestIds = (saved || []).map((r: any) => r.interest)
  if (!interestIds.length) return getHotPosts(db, profileId)

  const posts = await getPostsByInterestIds(db, interestIds, profileId, 30)
  // Fall back to hot posts if the user's interests have no content yet
  return posts.length ? posts : getHotPosts(db, profileId)
}

/** Category tab: posts matching interests in the given NIGERIAN_INTERESTS categories. */
async function getCategoryPosts(db: Supabase, categories: readonly string[], profileId: string | null) {
  const interestIds = NIGERIAN_INTERESTS
    .filter(i => categories.includes(i.category))
    .map(i => i.id)
  return getPostsByInterestIds(db, interestIds, profileId, 30)
}

/** Hot posts: highest likes_count in last 48 hrs. */
async function getHotPosts(db: Supabase, profileId: string | null) {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { data: raw } = await db
    .from('posts')
    .select(POST_SELECT)
    .is('deleted_at', null)
    .is('parent_post_id', null)
    .neq('post_type', 'repost')
    .gte('created_at', since)
    .order('likes_count', { ascending: false })
    .limit(20)
  const posts = raw || []
  if (!posts.length) return []
  if (!profileId) return noEngagement(posts)
  return hydrateEngagement(db, profileId, posts)
}

async function getTrending(db: Supabase): Promise<TrendingTag[]> {
  const { data } = await db
    .from('hashtags')
    .select('tag, posts_count')
    .order('posts_count', { ascending: false })
    .limit(10)
  return (data || []) as TrendingTag[]
}

async function getSuggestedPeople(db: Supabase, profileId: string): Promise<UserResult[]> {
  const { data: follows } = await db.from('follows').select('following_id').eq('follower_id', profileId)
  const excludeIds = [profileId, ...((follows || []).map((f: any) => f.following_id))]
  let q = db
    .from('users')
    .select('id, username, display_name, avatar_url, verification_tier, followers_count, bio, is_monetised')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('followers_count', { ascending: false })
    .limit(5)
  if (excludeIds.length) q = q.not('id', 'in', `(${excludeIds.join(',')})`)
  const { data } = await q
  return (data || []) as UserResult[]
}

// ─── Search fetchers ──────────────────────────────────────────────────────────

async function searchPosts(db: Supabase, query: string, profileId: string | null) {
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

  if (!rawPosts.length || !profileId) return noEngagement(rawPosts)
  return hydrateEngagement(db, profileId, rawPosts)
}

async function searchUsers(db: Supabase, query: string): Promise<UserResult[]> {
  const term = query.startsWith('#') ? query.slice(1) : query
  const { data } = await db.from('users')
    .select('id, username, display_name, avatar_url, verification_tier, followers_count, bio, is_monetised')
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .is('deleted_at', null).neq('status', 'banned')
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

const AVATAR_COLORS = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A6A1A', '#1A6A6A']
function avatarBg(s: string) { return AVATAR_COLORS[s.charCodeAt(0) % AVATAR_COLORS.length] }

function UserCard({ u }: { u: UserResult }) {
  const initials = u.display_name?.slice(0, 2).toUpperCase() || 'SP'
  return (
    <Link href={`/user/${u.username}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 13, padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ width: 46, height: 46, borderRadius: '50%', background: u.avatar_url ? 'transparent' : avatarBg(u.username), flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: 'white', border: '2px solid var(--color-border)' }}>
        {u.avatar_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={u.avatar_url} alt={u.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>{u.display_name}</span>
          {u.verification_tier && u.verification_tier !== 'none' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: u.verification_tier === 'organisation' ? '#D4A017' : 'var(--color-brand)' }}>
              <BadgeCheck size={11} color="white" />
            </span>
          )}
          {u.is_monetised && <Star size={12} fill="var(--color-gold)" stroke="none" />}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 1 }}>@{u.username} · {formatNumber(u.followers_count)} followers</div>
        {u.bio && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{u.bio}</p>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--color-brand)', fontWeight: 700, flexShrink: 0 }}>
        View <ArrowUpRight size={12} />
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
  const params   = await searchParams
  const query    = params.q?.trim() || ''
  const etab     = (params.etab as ExploreTabKey) || 'for-you'
  const searchTab = (params.tab as SearchTabKey) || 'posts'

  const db = await createClient()

  const { data: { user } } = await db.auth.getUser()
  let profileId: string | null = null
  if (user) {
    const { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
    profileId = profile?.id ?? null
  }

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
      searchPosts(db, query, profileId),
      searchUsers(db, query),
      searchHashtags(db, query),
    ])
    const counts: Record<SearchTabKey, number> = {
      posts:    postResults.length,
      people:   userResults.length,
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
        {searchTab === 'people' && (userResults.length === 0 ? <EmptyState Icon={UserRound} title="No people found" sub={`No accounts match "${query}".`} /> : userResults.map(u => <UserCard key={u.id} u={u} />))}
        {searchTab === 'hashtags' && (hashtagResults.length === 0 ? <EmptyState Icon={Hash} title="No hashtags found" sub={`No hashtags match "${query}".`} /> : hashtagResults.map(t => <HashtagRow key={t.tag} t={t} />))}
      </div>
    )
  }

  // ─── No-search: explore tabs ───────────────────────────────────────────────

  // For You tab
  if (etab === 'for-you') {
    const [forYouPosts, suggestedPeople] = await Promise.all([
      getForYouPosts(db, profileId),
      profileId ? getSuggestedPeople(db, profileId) : Promise.resolve([]),
    ])
    return (
      <div>
        {StickyHeader}
        {forYouPosts.length === 0
          ? <EmptyState Icon={Sparkles} title="Nothing here yet" sub="Follow people and select interests during onboarding to personalise your feed." />
          : forYouPosts.map((p: any) => <PostCard key={p.id} post={p} />)
        }
        {suggestedPeople.length > 0 && (
          <div style={{ borderTop: '1px solid var(--color-border)' }}>
            <SectionHeader icon={Users} title="Who to follow" seeAllHref="/explore?etab=for-you&discover=1" />
            {suggestedPeople.map(u => <UserCard key={u.id} u={u} />)}
          </div>
        )}
      </div>
    )
  }

  // Trending tab
  if (etab === 'trending') {
    const [hotPosts, trending] = await Promise.all([
      getHotPosts(db, profileId),
      getTrending(db),
    ])
    return (
      <div>
        {StickyHeader}
        {hotPosts.length > 0 && (
          <div style={{ borderBottom: '1px solid var(--color-border)' }}>
            <SectionHeader icon={Flame} title="Hot right now" />
            {hotPosts.map((p: any) => <PostCard key={p.id} post={p} />)}
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

  // News / Sports / Entertainment tabs
  const tabConfig = EXPLORE_TABS.find(t => t.key === etab)
  if (tabConfig && tabConfig.categories) {
    const posts = await getCategoryPosts(db, tabConfig.categories, profileId)
    const TabIcon = tabConfig.icon
    return (
      <div>
        {StickyHeader}
        {posts.length === 0
          ? <EmptyState Icon={TabIcon} title={`No ${tabConfig.label} posts yet`} sub={`Be the first to post about ${tabConfig.label.toLowerCase()} topics and they'll appear here.`} />
          : posts.map((p: any) => <PostCard key={p.id} post={p} />)
        }
      </div>
    )
  }

  // Fallback (shouldn't be reached)
  return <div>{StickyHeader}</div>
}