// src/app/(main)/explore/page.tsx
// Production-ready explore page:
//  - No search: trending hashtags + topic pills + suggested people
//  - With search: full-text posts, people, hashtags — tabbed, with auth-aware like/bookmark state
//  - Hashtag search (#tag) routes through post_hashtags join for accurate results
//  - All reads parallel, auth context hydrates engagement state

import React from 'react'
import { createClient } from '@/lib/supabase/server'
import { formatNumber } from '@/lib/utils'
import PostCard from '@/components/feed/post-card'
import Link from 'next/link'
import ExploreSearchInput from './search-input'
import { BadgeCheck, Star, TrendingUp, Users, Hash, Flame, ArrowUpRight, Search, UserRound, Globe, Mic2, Cpu, Briefcase, ShoppingBag, Tv2, Gamepad2, Utensils, BookOpen } from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const TOPIC_PILLS = [
  { label: 'Football',    q: 'football'     },
  { label: 'Afrobeats',   q: 'afrobeats'    },
  { label: 'Politics',    q: 'politics'     },
  { label: 'Business',    q: 'business'     },
  { label: 'Nollywood',   q: 'nollywood'    },
  { label: 'Comedy',      q: 'comedy'       },
  { label: 'Tech',        q: 'tech'         },
  { label: 'Fashion',     q: 'fashion'      },
  { label: 'Crypto',      q: 'crypto'       },
  { label: 'Faith',       q: 'spirituality' },
  { label: 'Food',        q: 'food'         },
  { label: 'Gaming',      q: 'gaming'       },
]

const FALLBACK_TRENDING = [
  { tag: 'SuperEagles',  posts_count: 14200, category: 'Sports'      },
  { tag: 'LagosTech',    posts_count: 9800,  category: 'Technology'  },
  { tag: 'CBNPolicy',    posts_count: 7400,  category: 'Finance'     },
  { tag: 'Afrobeats',    posts_count: 6100,  category: 'Music'       },
  { tag: 'NaijaFashion', posts_count: 4400,  category: 'Lifestyle'   },
  { tag: 'SoroSoke',     posts_count: 3800,  category: 'Politics'    },
  { tag: 'NollyGossip',  posts_count: 2900,  category: 'Entertainment'},
  { tag: 'NaijaMusic',   posts_count: 2400,  category: 'Music'       },
  { tag: 'SportsBet9ja', posts_count: 1900,  category: 'Sports'      },
  { tag: 'GistMeSpup',   posts_count: 1500,  category: 'Trending'    },
]

const AVATAR_COLORS = ['#1A7A4A','#7A3A1A','#1A4A7A','#4A1A7A','#7A6A1A','#1A6A6A']
function avatarBg(s: string) { return AVATAR_COLORS[s.charCodeAt(0) % AVATAR_COLORS.length] }

const POST_SELECT = `
  id, body, post_type, likes_count, dislikes_count, comments_count, reposts_count,
  bookmarks_count, impressions_count, created_at, edited_at, is_sensitive,
  author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier, is_monetised),
  media:post_media(id, media_type, url, thumbnail_url, width, height, position)
`

// ─── Shared types ─────────────────────────────────────────────────────────────

type Supabase = Awaited<ReturnType<typeof createClient>>

interface TrendingTag { tag: string; posts_count: number; category?: string }
interface UserResult {
  id: string; username: string; display_name: string
  avatar_url: string | null; verification_tier: string
  followers_count: number; bio: string | null; is_monetised: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getTrending(db: Supabase): Promise<TrendingTag[]> {
  const { data } = await db
    .from('hashtags')
    .select('tag, posts_count, category')
    .order('posts_count', { ascending: false })
    .limit(10)
  return (data && data.length > 0) ? data as TrendingTag[] : FALLBACK_TRENDING
}

async function searchPosts(db: Supabase, query: string, profileId: string | null) {
  const isHashtag = query.startsWith('#')
  const term = isHashtag ? query.slice(1).toLowerCase() : query

  let rawPosts: any[] = []

  if (isHashtag) {
    // Accurate hashtag search via post_hashtags join
    const { data: tagRow } = await db
      .from('hashtags')
      .select('id')
      .eq('tag', term)
      .maybeSingle()

    if (tagRow) {
      const { data } = await db
        .from('post_hashtags')
        .select(`post:posts(${POST_SELECT})`)
        .eq('hashtag_id', tagRow.id)
        .limit(30)
      rawPosts = (data || []).map((r: any) => r.post).filter(Boolean)
    }
  } else {
    // Full-text search on body
    const { data } = await db
      .from('posts')
      .select(POST_SELECT)
      .ilike('body', `%${term}%`)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(30)
    rawPosts = data || []
  }

  if (!rawPosts.length || !profileId) {
    return rawPosts.map((p: any) => ({ ...p, is_liked: false, is_disliked: false, is_reposted: false, is_bookmarked: false }))
  }

  // Hydrate engagement state for the current user
  const postIds = rawPosts.map((p: any) => p.id)
  const [{ data: likes }, { data: reposts }, { data: bookmarks }, { data: dislikes }] = await Promise.all([
    db.from('likes').select('post_id').eq('user_id', profileId).in('post_id', postIds),
    db.from('reposts').select('post_id').eq('user_id', profileId).in('post_id', postIds),
    db.from('bookmarks').select('post_id').eq('user_id', profileId).in('post_id', postIds),
    db.from('dislikes').select('post_id').eq('user_id', profileId).in('post_id', postIds),
  ])

  const likedSet    = new Set((likes    || []).map((r: any) => r.post_id))
  const repostedSet = new Set((reposts  || []).map((r: any) => r.post_id))
  const bookmarkedSet = new Set((bookmarks || []).map((r: any) => r.post_id))
  const dislikedSet = new Set((dislikes || []).map((r: any) => r.post_id))

  return rawPosts.map((p: any) => ({
    ...p,
    is_liked:      likedSet.has(p.id),
    is_disliked:   dislikedSet.has(p.id),
    is_reposted:   repostedSet.has(p.id),
    is_bookmarked: bookmarkedSet.has(p.id),
  }))
}

async function searchUsers(db: Supabase, query: string): Promise<UserResult[]> {
  const term = query.startsWith('#') ? query.slice(1) : query
  const { data } = await db
    .from('users')
    .select('id, username, display_name, avatar_url, verification_tier, followers_count, bio, is_monetised')
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .is('deleted_at', null)
    .neq('status', 'banned')
    .order('followers_count', { ascending: false })
    .limit(20)
  return (data || []) as UserResult[]
}

async function searchHashtags(db: Supabase, query: string): Promise<TrendingTag[]> {
  const term = query.startsWith('#') ? query.slice(1) : query
  const { data } = await db
    .from('hashtags')
    .select('tag, posts_count, category')
    .ilike('tag', `%${term}%`)
    .order('posts_count', { ascending: false })
    .limit(20)
  return (data || []) as TrendingTag[]
}

async function getSuggestedPeople(db: Supabase, profileId: string): Promise<UserResult[]> {
  const { data: follows } = await db
    .from('follows')
    .select('following_id')
    .eq('follower_id', profileId)

  const excludeIds = [profileId, ...((follows || []).map((f: any) => f.following_id))]

  let q = db
    .from('users')
    .select('id, username, display_name, avatar_url, verification_tier, followers_count, bio, is_monetised')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('followers_count', { ascending: false })
    .limit(6)

  if (excludeIds.length > 0) {
    q = q.not('id', 'in', `(${excludeIds.join(',')})`)
  }

  const { data } = await q
  return (data || []) as UserResult[]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function UserCard({ u, showBio = true }: { u: UserResult; showBio?: boolean }) {
  const initials = u.display_name?.slice(0, 2).toUpperCase() || 'SP'
  return (
    <Link href={`/user/${u.username}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 13, padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{
        width: 46, height: 46, borderRadius: '50%',
        background: u.avatar_url ? 'transparent' : avatarBg(u.username),
        flexShrink: 0, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, color: 'white',
        border: '2px solid var(--color-border)',
      }}>
        {u.avatar_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={u.avatar_url} alt={u.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif" }}>
            {u.display_name}
          </span>
          {u.verification_tier && u.verification_tier !== 'none' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 16, height: 16, borderRadius: '50%',
              background: u.verification_tier === 'organisation' ? '#D4A017' : 'var(--color-brand)',
            }}>
              <BadgeCheck size={11} color="white" />
            </span>
          )}
          {u.is_monetised && <Star size={12} fill="var(--color-gold)" stroke="none" />}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 1 }}>
          @{u.username} · {formatNumber(u.followers_count)} followers
        </div>
        {showBio && u.bio && (
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {u.bio}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--color-brand)', fontWeight: 700, fontFamily: "'Syne', sans-serif", flexShrink: 0 }}>
        View <ArrowUpRight size={12} />
      </div>
    </Link>
  )
}

function HashtagRow({ t, rank }: { t: TrendingTag; rank?: number }) {
  return (
    <Link href={`/explore?q=${encodeURIComponent('#' + t.tag)}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderBottom: '1px solid var(--color-border)' }}>
      {rank !== undefined
        ? (
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: rank === 0 ? 'var(--color-brand-muted)' : 'var(--color-surface-2)',
            border: `1px solid ${rank === 0 ? 'var(--color-brand-border)' : 'var(--color-border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800,
            color: rank === 0 ? 'var(--color-brand)' : 'var(--color-text-muted)',
            fontFamily: "'Syne', sans-serif",
          }}>
            {rank + 1}
          </div>
        )
        : (
          <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'var(--color-brand-muted)', border: '1px solid var(--color-brand-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Hash size={13} color="var(--color-brand)" />
          </div>
        )
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 2 }}>
          {t.category ?? 'Trending'}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif" }}>
          #{t.tag}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
          {formatNumber(t.posts_count)} posts
        </div>
      </div>
      <TrendingUp size={14} style={{ color: 'var(--color-text-faint)', flexShrink: 0 }} />
    </Link>
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
      <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 17, color: 'var(--color-text-primary)', marginBottom: 8 }}>{title}</h3>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', maxWidth: 260, margin: '0 auto' }}>{sub}</p>
    </div>
  )
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'posts',   label: 'Posts',   icon: null  },
  { key: 'people',  label: 'People',  icon: null  },
  { key: 'hashtags',label: 'Hashtags',icon: null  },
] as const

type TabKey = typeof TABS[number]['key']

function TabBar({ query, activeTab, counts }: { query: string; activeTab: TabKey; counts: Record<TabKey, number> }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '12px 20px', borderBottom: '1px solid var(--color-border)', overflowX: 'auto' }}>
      {TABS.map(tab => {
        const active = activeTab === tab.key
        return (
          <Link
            key={tab.key}
            href={`/explore?q=${encodeURIComponent(query)}&tab=${tab.key}`}
            style={{
              padding: '7px 16px', borderRadius: 20, textDecoration: 'none',
              fontSize: 13, fontWeight: 600, fontFamily: "'Syne', sans-serif",
              background: active ? 'var(--color-brand)' : 'var(--color-surface-2)',
              color: active ? 'white' : 'var(--color-text-secondary)',
              border: `1px solid ${active ? 'var(--color-brand)' : 'var(--color-border)'}`,
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span style={{ opacity: 0.8, marginLeft: 5 }}>({counts[tab.key]})</span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface SP { q?: string; tab?: string }

export default async function ExplorePage({ searchParams }: { searchParams: Promise<SP> }) {
  const params = await searchParams
  const query = params.q?.trim() || ''
  const activeTab = (params.tab as TabKey) || 'posts'

  const db = await createClient()

  // Get current user identity for engagement hydration
  const { data: { user } } = await db.auth.getUser()
  let profileId: string | null = null
  if (user) {
    const { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
    profileId = profile?.id ?? null
  }

  // ─── No-search state: trending + suggested people ───────────────────────────
  if (!query) {
    const [trending, suggestedPeople] = await Promise.all([
      getTrending(db),
      profileId ? getSuggestedPeople(db, profileId) : Promise.resolve([]),
    ])

    return (
      <div>
        {/* Sticky search bar */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(20px)', background: 'var(--nav-bg)', borderBottom: '1px solid var(--color-border)', padding: '12px 20px' }}>
          <ExploreSearchInput defaultValue="" />
        </div>

        {/* Topic pills */}
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Hash size={14} color="var(--color-brand)" />
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', margin: 0 }}>
              Browse Topics
            </h2>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            {TOPIC_PILLS.map(t => (
              <Link key={t.q} href={`/explore?q=${encodeURIComponent(t.q)}`} style={{
                padding: '7px 15px', borderRadius: 100,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-primary)',
                fontSize: 13, textDecoration: 'none',
                fontFamily: "'DM Sans', sans-serif",
                transition: 'border-color 0.12s',
              }}>
                {t.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Trending */}
        <div style={{ borderTop: '1px solid var(--color-border)' }}>
          <div style={{ padding: '16px 20px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={15} color="var(--color-brand)" />
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', margin: 0 }}>
              Trending in Nigeria
            </h2>
          </div>
          {trending.map((t, i) => <HashtagRow key={t.tag} t={t} rank={i} />)}
        </div>

        {/* Suggested people */}
        {suggestedPeople.length > 0 && (
          <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 8 }}>
            <div style={{ padding: '16px 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={15} color="var(--color-brand)" />
                <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', margin: 0 }}>
                  Who to follow
                </h2>
              </div>
              <Link href="/explore?tab=people&q=." style={{ fontSize: 12, color: 'var(--color-brand)', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                See all <ArrowUpRight size={12} />
              </Link>
            </div>
            {suggestedPeople.map(u => <UserCard key={u.id} u={u} />)}
          </div>
        )}
      </div>
    )
  }

  // ─── Search state: parallel fetch all three tabs ───────────────────────────
  const [postResults, userResults, hashtagResults] = await Promise.all([
    searchPosts(db, query, profileId),
    searchUsers(db, query),
    searchHashtags(db, query),
  ])

  const counts: Record<TabKey, number> = {
    posts:    postResults.length,
    people:   userResults.length,
    hashtags: hashtagResults.length,
  }
  const totalResults = counts.posts + counts.people + counts.hashtags

  return (
    <div>
      {/* Sticky search bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(20px)', background: 'var(--nav-bg)', borderBottom: '1px solid var(--color-border)', padding: '12px 20px' }}>
        <ExploreSearchInput defaultValue={query} />
      </div>

      {/* Results summary + tab bar */}
      <div style={{ padding: '12px 20px 0', borderBottom: '1px solid var(--color-border)' }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
          {totalResults === 0
            ? 'No results for '
            : `${totalResults.toLocaleString()} result${totalResults !== 1 ? 's' : ''} for `
          }
          <strong style={{ color: 'var(--color-text-primary)' }}>&ldquo;{query}&rdquo;</strong>
        </p>
        <TabBar query={query} activeTab={activeTab} counts={counts} />
      </div>

      {/* Posts tab */}
      {activeTab === 'posts' && (
        postResults.length === 0
          ? <EmptyState Icon={Search} title="No posts found" sub={`No posts match "${query}". Try different keywords or search a #hashtag.`} />
          : postResults.map((post: any) => <PostCard key={post.id} post={post} />)
      )}

      {/* People tab */}
      {activeTab === 'people' && (
        userResults.length === 0
          ? <EmptyState Icon={UserRound} title="No people found" sub={`No accounts match "${query}". Try searching by username or display name.`} />
          : userResults.map(u => <UserCard key={u.id} u={u} />)
      )}

      {/* Hashtags tab */}
      {activeTab === 'hashtags' && (
        hashtagResults.length === 0
          ? <EmptyState Icon={Hash} title="No hashtags found" sub={`No hashtags match "${query}". Try a shorter term.`} />
          : hashtagResults.map(t => <HashtagRow key={t.tag} t={t} />)
      )}
    </div>
  )
}