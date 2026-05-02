// src/app/(main)/user/[username]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { getProfileByUsername, getUserPosts } from '@/lib/queries'
import { formatNumber } from '@/lib/utils'
import { MapPin, LinkIcon, Calendar, Lock } from 'lucide-react'
import Link from 'next/link'
import FollowButton from './follow-button'
import ProfileTabs  from '@/components/profile/profile-tabs'
import type { FeedPost } from '@/lib/actions/feed'
import type { Metadata } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

// ── Dynamic metadata ──────────────────────────────────────────────────────────
export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> }
): Promise<Metadata> {
  const { username } = await params
  const profile = await getProfileByUsername(username)

  if (!profile || profile.status === 'banned') {
    return { title: 'User not found', robots: { index: false, follow: false } }
  }

  const title       = `${profile.display_name} (@${profile.username})`
  const description = profile.bio
    ? `${profile.bio} — Follow @${profile.username} on Spup`
    : `Follow @${profile.username} on Spup. ${profile.followers_count ?? 0} followers.`
  const profileUrl  = `${BASE_URL}/user/${profile.username}`
  const preview     = profile.avatar_url ?? `${BASE_URL}/og/default.png`

  return {
    title, description,
    alternates: { canonical: profileUrl },
    openGraph: {
      type: 'profile', title, description, url: profileUrl,
      siteName: 'Spup', locale: 'en_NG', username: profile.username,
      images: [{ url: preview, width: 400, height: 400, alt: `${profile.display_name} on Spup` }],
    },
    twitter: {
      card: 'summary', site: '@spupng', creator: `@${profile.username}`,
      title, description, images: [preview],
    },
    robots: profile.is_private
      ? { index: false, follow: false }
      : { index: true,  follow: true  },
  }
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params

  const profile = await getProfileByUsername(username)
  if (!profile || profile.status === 'banned') notFound()

  // Viewer identity
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  let viewerProfileId: string | null = null
  let isOwnProfile = false
  let isFollowing  = false

  if (authUser) {
    const { data: viewer } = await supabase
      .from('users').select('id').eq('auth_id', authUser.id).single()
    if (viewer) {
      viewerProfileId = viewer.id
      isOwnProfile    = viewer.id === profile.id

      if (!isOwnProfile) {
        const { data: follow } = await supabase
          .from('follows').select('id')
          .match({ follower_id: viewer.id, following_id: profile.id })
          .maybeSingle()
        isFollowing = !!follow
      }
    }
  }

  // If own profile — redirect to /profile (canonical own-profile URL)
  if (isOwnProfile) redirect('/profile')

  const canSeeContent = !profile.is_private || isFollowing
  const rawPosts      = canSeeContent ? await getUserPosts(profile.id, 20) : []

  // Hydrate engagement for the viewer
  const postIds = rawPosts.map((p: any) => p.id)
  let likedSet      = new Set<string>()
  let repostedSet   = new Set<string>()
  let bookmarkedSet = new Set<string>()

  if (viewerProfileId && postIds.length) {
    const [{ data: likes }, { data: reposts }, { data: bookmarks }] = await Promise.all([
      supabase.from('likes').select('post_id').eq('user_id', viewerProfileId).in('post_id', postIds),
      supabase.from('posts').select('parent_post_id').eq('user_id', viewerProfileId).eq('post_type', 'repost').in('parent_post_id', postIds),
      supabase.from('bookmarks').select('post_id').eq('user_id', viewerProfileId).in('post_id', postIds),
    ])
    likedSet      = new Set((likes     || []).map((r: any) => r.post_id))
    repostedSet   = new Set((reposts   || []).map((r: any) => r.parent_post_id))
    bookmarkedSet = new Set((bookmarks || []).map((r: any) => r.post_id))
  }

  const initialPosts: FeedPost[] = rawPosts.map((p: any) => ({
    ...p,
    is_liked:      likedSet.has(p.id),
    is_disliked:   false,
    is_reposted:   repostedSet.has(p.id),
    is_bookmarked: bookmarkedSet.has(p.id),
  }))

  const joinDate  = new Date(profile.created_at).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })
  const initials  = profile.display_name?.slice(0, 2).toUpperCase() || 'SP'
  const AVATAR_COLORS = ['#1A9E5F','#7A3A1A','#1A4A7A','#4A1A7A','#7A6A1A']
  const avatarBg  = AVATAR_COLORS[profile.username.charCodeAt(0) % AVATAR_COLORS.length]

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.display_name,
    alternateName: `@${profile.username}`,
    description: profile.bio ?? undefined,
    image: profile.avatar_url ?? undefined,
    url: `${BASE_URL}/user/${profile.username}`,
    interactionStatistic: [
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/FollowAction', userInteractionCount: profile.followers_count ?? 0 },
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/WriteAction',  userInteractionCount: profile.posts_count ?? 0 },
    ],
    memberOf: { '@type': 'Organization', name: 'Spup', url: BASE_URL },
  }

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Banner */}
      <div style={{
        height: 140, position: 'relative', overflow: 'hidden',
        background: profile.banner_url
          ? 'transparent'
          : 'linear-gradient(135deg, #0A2016 0%, #1A3A20 50%, #0F2510 100%)',
      }}>
        {profile.banner_url && (
          <img src={profile.banner_url} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
      </div>

      <div style={{ padding: '0 20px', position: 'relative' }}>
        {/* Avatar + action row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
          <div style={{
            width: 84, height: 84, borderRadius: '50%',
            background: profile.avatar_url ? 'transparent' : `linear-gradient(135deg, ${avatarBg}, ${avatarBg}99)`,
            border: '4px solid var(--color-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 28, color: 'white',
            position: 'relative', zIndex: 1, overflow: 'hidden', flexShrink: 0,
            marginTop: -42,
          }}>
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt={profile.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initials
            }
            {profile.verification_tier !== 'none' && (
              <div style={{
                position: 'absolute', bottom: 2, right: 2,
                width: 22, height: 22, borderRadius: '50%',
                background: 'var(--color-brand)',
                border: '2px solid var(--color-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: 'white',
              }}>✓</div>
            )}
          </div>

          {/* Follow / login prompt */}
          {authUser && viewerProfileId ? (
            <FollowButton
              targetUserId={profile.id}
              initialFollowing={isFollowing}
              isPrivate={profile.is_private}
            />
          ) : (
            <Link href="/login" style={{
              background: 'var(--color-brand)', color: 'white', border: 'none',
              borderRadius: 20, padding: '9px 22px',
              fontSize: 14, fontWeight: 700, textDecoration: 'none',
              fontFamily: "'Syne', sans-serif",
            }}>
              Follow
            </Link>
          )}
        </div>

        {/* Name + bio + meta */}
        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22,
          color: 'var(--color-text-primary)', letterSpacing: '-0.01em', marginBottom: 2,
        }}>
          {profile.display_name}
          {profile.is_monetised && (
            <span style={{
              marginLeft: 8, fontSize: 11,
              background: 'var(--color-gold)', color: '#000',
              padding: '2px 7px', borderRadius: 4, fontWeight: 700, verticalAlign: 'middle',
            }}>PRO</span>
          )}
        </h1>

        <p style={{ fontSize: 15, color: 'var(--color-text-muted)', marginBottom: 10 }}>
          @{profile.username}
        </p>

        {profile.bio && (
          <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', lineHeight: 1.65, marginBottom: 12 }}>
            {profile.bio}
          </p>
        )}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          {profile.location && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--color-text-muted)' }}>
              <MapPin size={13} />{profile.location}
            </span>
          )}
          {profile.website_url && (
            <a href={profile.website_url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--color-brand)', textDecoration: 'none' }}>
              <LinkIcon size={13} />{profile.website_url.replace(/^https?:\/\//, '')}
            </a>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--color-text-muted)' }}>
            <Calendar size={13} />Joined {joinDate}
          </span>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 4 }}>
          {[
            { value: formatNumber(profile.following_count), label: 'Following' },
            { value: formatNumber(profile.followers_count), label: 'Followers' },
          ].map(({ value, label }) => (
            <div key={label}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--color-text-primary)' }}>{value}</span>
              {' '}<span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Private lock state */}
      {profile.is_private && !canSeeContent && (
        <div style={{ padding: '40px 20px', textAlign: 'center', marginTop: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--color-surface-3)', border: '1px solid var(--color-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Lock size={22} color="var(--color-text-muted)" />
          </div>
          <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 17, color: 'var(--color-text-primary)', marginBottom: 8 }}>
            This account is private
          </h3>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
            Follow to see their posts.
          </p>
        </div>
      )}

      {/* Tabs + content */}
      <ProfileTabs
        profileId={profile.id}
        initialPosts={initialPosts}
        isOwner={false}
        canSeeContent={canSeeContent}
      />
    </div>
  )
}