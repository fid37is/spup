// src/app/(main)/explore/page.tsx

import { createClient } from '@/lib/supabase/server'
import { formatNumber } from '@/lib/utils'
import PostCard from '@/components/feed/post-card'
import Link from 'next/link'
import ExploreSearchInput from './search-input'

const TOPIC_PILLS = ['Football','Afrobeats','Politics','Business','Nollywood','Comedy','Tech','Fashion','Crypto','Faith']
const AVATAR_COLORS = ['#1A9E5F','#7A3A1A','#1A4A7A','#4A1A7A','#7A6A1A']
const FALLBACK_TRENDING = [
  { tag: 'LagosSpeaks',  posts_count: 14200 },
  { tag: 'SuperEagles',  posts_count: 8900  },
  { tag: 'CBNPolicy',    posts_count: 6100  },
  { tag: 'NaijaFashion', posts_count: 4400  },
  { tag: 'AbujaTech',    posts_count: 3200  },
  { tag: 'SoroSoke',     posts_count: 2800  },
  { tag: 'NollyGossip',  posts_count: 2100  },
  { tag: 'NaijaMusic',   posts_count: 1900  },
  { tag: 'SportsBet9ja', posts_count: 1700  },
  { tag: 'GistMeSpup',   posts_count: 1400  },
]

type Supabase = Awaited<ReturnType<typeof createClient>>

async function getTrending(db: Supabase) {
  const { data } = await db
    .from('hashtags')
    .select('tag, posts_count')
    .order('posts_count', { ascending: false })
    .limit(10)
  return (data && data.length > 0) ? data : FALLBACK_TRENDING
}

async function doSearchPosts(db: Supabase, query: string) {
  const { data } = await db
    .from('posts')
    .select(`
      id, body, post_type, likes_count, dislikes_count, comments_count, reposts_count,
      bookmarks_count, impressions_count, created_at, edited_at, is_sensitive,
      author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier, is_monetised),
      media:post_media(id, media_type, url, thumbnail_url, width, height, position)
    `)
    .ilike('body', `%${query}%`)
    .is('deleted_at', null)
    .eq('is_sensitive', false)
    .order('created_at', { ascending: false })
    .limit(20)
  return data || []
}

async function doSearchUsers(db: Supabase, query: string) {
  const { data } = await db
    .from('users')
    .select('id, username, display_name, avatar_url, verification_tier, followers_count, bio')
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .is('deleted_at', null)
    .neq('status', 'banned')
    .order('followers_count', { ascending: false })
    .limit(10)
  return data || []
}

interface SP { q?: string; tab?: string }

export default async function ExplorePage({ searchParams }: { searchParams: Promise<SP> }) {
  const params = await searchParams
  const query = params.q?.trim() || ''
  const activeTab = params.tab || 'posts'

  const db = await createClient()

  const [trending, postResults, userResults] = await Promise.all([
    query ? Promise.resolve([]) : getTrending(db),
    query ? doSearchPosts(db, query) : Promise.resolve([]),
    query ? doSearchUsers(db, query) : Promise.resolve([]),
  ])

  const totalResults = postResults.length + userResults.length

  return (
    <div>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)',
        background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        padding: '12px 20px',
      }}>
        <ExploreSearchInput defaultValue={query} />
      </div>

      {!query && (
        <>
          <div style={{ padding: '20px 20px 0' }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', marginBottom: 14 }}>
              Browse topics
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
              {TOPIC_PILLS.map(t => (
                <a key={t} href={`/explore?q=${encodeURIComponent(t)}`} style={{
                  padding: '8px 16px', borderRadius: 100,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text-primary)',
                  fontSize: 13, textDecoration: 'none',
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  {t}
                </a>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)' }}>
            <div style={{ padding: '16px 20px 10px' }}>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)', margin: 0 }}>
                Trending in Nigeria 🇳🇬
              </h2>
            </div>
            {trending.map((t: any, i: number) => (
              <a key={t.tag} href={`/explore?q=${encodeURIComponent('#' + t.tag)}`} style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{ padding: '13px 20px', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 2 }}>#{i + 1} · Trending</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif" }}>#{t.tag}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{(t.posts_count as number).toLocaleString()} posts</div>
                </div>
              </a>
            ))}
          </div>
        </>
      )}

      {query && (
        <>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
              {totalResults === 0 ? 'No results' : `${totalResults} result${totalResults !== 1 ? 's' : ''}`} for{' '}
              <strong style={{ color: 'var(--color-text-primary)' }}>&ldquo;{query}&rdquo;</strong>
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { key: 'posts', label: 'Posts', count: postResults.length },
                { key: 'people', label: 'People', count: userResults.length },
              ].map(tab => (
                <a key={tab.key} href={`/explore?q=${encodeURIComponent(query)}&tab=${tab.key}`} style={{
                  padding: '7px 16px', borderRadius: 20, textDecoration: 'none',
                  fontSize: 13, fontWeight: 600, fontFamily: "'Syne', sans-serif",
                  background: activeTab === tab.key ? 'var(--color-brand)' : 'var(--color-surface-2)',
                  color: activeTab === tab.key ? 'white' : 'var(--color-text-secondary)',
                  border: `1px solid ${activeTab === tab.key ? 'var(--color-brand)' : 'var(--color-border)'}`,
                }}>
                  {tab.label}
                  {tab.count > 0 && <span style={{ opacity: 0.75 }}> ({tab.count})</span>}
                </a>
              ))}
            </div>
          </div>

          {activeTab === 'people' && userResults.map((u: any) => {
            const initials = u.display_name?.slice(0, 2).toUpperCase() || 'SP'
            const color = AVATAR_COLORS[u.username.charCodeAt(0) % AVATAR_COLORS.length]
            return (
              <Link key={u.id} href={`/user/${u.username}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: u.avatar_url ? 'transparent' : color,
                  flexShrink: 0, overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15, color: 'white',
                }}>
                  {u.avatar_url
                    ? <img src={u.avatar_url} alt={u.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : initials
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif", display: 'flex', alignItems: 'center', gap: 6 }}>
                    {u.display_name}
                    {u.verification_tier !== 'none' && (
                      <span style={{ fontSize: 10, background: 'var(--color-brand)', color: 'white', padding: '1px 5px', borderRadius: 4 }}>✓</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    @{u.username} · {formatNumber(u.followers_count)} followers
                  </div>
                  {u.bio && (
                    <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '3px 0 0', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {u.bio}
                    </p>
                  )}
                </div>
              </Link>
            )
          })}

          {activeTab === 'posts' && (
            postResults.length === 0
              ? (
                <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                  <p style={{ fontSize: 28, marginBottom: 12 }}>🔍</p>
                  <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 8 }}>No posts found</h3>
                  <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Try different keywords</p>
                </div>
              )
              : postResults.map((post: any) => (
                <PostCard key={post.id} post={{ ...post, is_liked: false, is_bookmarked: false, is_reposted: false, is_disliked: false }} />
              ))
          )}
        </>
      )}
    </div>
  )
}