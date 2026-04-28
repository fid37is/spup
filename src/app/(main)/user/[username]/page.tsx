// src/app/(main)/user/[username]/page.tsx

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { getProfileByUsername, getUserPosts } from '@/lib/queries'
import { formatNumber } from '@/lib/utils'
import { MapPin, LinkIcon, Calendar, Lock } from 'lucide-react'
import PostCard from '@/components/feed/post-card'
import FollowButton from './follow-button'
import type { Metadata } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

// ── Dynamic metadata ────────────────────────────────────────────────────────
// This runs on the server before the page renders.
// It tells Google, WhatsApp, Twitter etc. what to show when someone shares
// a profile link — the user's name, bio, avatar, follower count etc.

export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> }
): Promise<Metadata> {
  const { username } = await params
  const profile = await getProfileByUsername(username)

  // If profile not found or banned — tell search engines not to index it
  if (!profile || profile.status === 'banned') {
    return {
      title: 'User not found',
      robots: { index: false, follow: false },
    }
  }

  const title = `${profile.display_name} (@${profile.username})`
  const description = profile.bio
    ? `${profile.bio} — Follow @${profile.username} on Spup`
    : `Follow @${profile.username} on Spup. ${profile.followers_count ?? 0} followers.`
  const profileUrl = `${BASE_URL}/user/${profile.username}`

  // Use their avatar for the preview image, fall back to the default Spup OG image
  const previewImage = profile.avatar_url ?? `${BASE_URL}/og/default.png`

  return {
    // Browser tab title and Google headline
    title,
    description,

    // Tells Google the "official" URL for this page (avoids duplicate indexing)
    alternates: { canonical: profileUrl },

    // Open Graph — used by WhatsApp, Facebook, LinkedIn, Telegram previews
    openGraph: {
      type: 'profile',
      title,
      description,
      url: profileUrl,
      siteName: 'Spup',
      locale: 'en_NG',
      username: profile.username,
      images: [
        {
          url: previewImage,
          width: 400,
          height: 400,
          alt: `${profile.display_name} on Spup`,
        },
      ],
    },

    // Twitter / X card — used when someone shares the link on Twitter/X
    twitter: {
      card: 'summary',
      site: '@spupng',
      creator: `@${profile.username}`,
      title,
      description,
      images: [previewImage],
    },

    // Private profiles should not appear in Google search results
    robots: profile.is_private
      ? { index: false, follow: false }
      : { index: true, follow: true },
  }
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params

  const profile = await getProfileByUsername(username)
  if (!profile || profile.status === 'banned') notFound()

  // Get viewer identity (for follow button state)
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  let viewerId: string | null = null
  let isOwnProfile = false
  let isFollowing = false

  if (authUser) {
    const { data: viewer } = await supabase
      .from('users').select('id, auth_id').eq('auth_id', authUser.id).single()
    if (viewer) {
      viewerId = viewer.id
      isOwnProfile = viewer.id === profile.id

      if (!isOwnProfile) {
        const { data: follow } = await supabase
          .from('follows').select('id')
          .match({ follower_id: viewer.id, following_id: profile.id })
          .maybeSingle()
        isFollowing = !!follow
      }
    }
  }

  // Private account — only followers see posts
  const canSeePosts = !profile.is_private || isOwnProfile || isFollowing
  const posts = canSeePosts ? await getUserPosts(profile.id, 20) : []

  const joinDate = new Date(profile.created_at).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })
  const initials = profile.display_name?.slice(0, 2).toUpperCase() || 'SP'
  const AVATAR_COLORS = ['#1A9E5F', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A6A1A']
  const avatarColor = AVATAR_COLORS[profile.username.charCodeAt(0) % AVATAR_COLORS.length]

  // Structured data — tells Google exactly who this person is,
  // their follower count, and links their profile to Spup as an organisation.
  // This can show up in Google's knowledge panel and rich results.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.display_name,
    alternateName: `@${profile.username}`,
    description: profile.bio ?? undefined,
    image: profile.avatar_url ?? undefined,
    url: `${BASE_URL}/user/${profile.username}`,
    interactionStatistic: [
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/FollowAction',
        userInteractionCount: profile.followers_count ?? 0,
      },
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/WriteAction',
        userInteractionCount: profile.posts_count ?? 0,
      },
    ],
    memberOf: {
      '@type': 'Organization',
      name: 'Spup',
      url: BASE_URL,
    },
  }

  return (
    <div>
      {/* Structured data — invisible to users, read by Google */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Banner */}
      <div style={{ height: 120, background: 'linear-gradient(135deg, #0A2016 0%, #1A3A20 50%, #0F2510 100%)' }} />

      <div style={{ padding: '0 20px', position: 'relative' }}>
        {/* Avatar + actions row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
          <div style={{
            width: 84, height: 84, borderRadius: '50%',
            background: profile.avatar_url ? 'transparent' : `linear-gradient(135deg, ${avatarColor}, ${avatarColor}99)`,
            border: '4px solid var(--color-bg)', marginTop: -42,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 30, color: 'white',
            position: 'relative', zIndex: 1, overflow: 'hidden', flexShrink: 0,
          }}>
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt={profile.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              : initials
            }
            {profile.verification_tier !== 'none' && (
              <div style={{ position: 'absolute', bottom: 2, right: 2, width: 22, height: 22, borderRadius: '50%', background: 'var(--color-brand)', border: '2px solid var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'white' }}>✓</div>
            )}
          </div>

          {isOwnProfile ? (
            <a href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #2A2A30', borderRadius: 20, padding: '8px 16px', textDecoration: 'none', color: '#F0F0EC', fontSize: 14, fontFamily: "'Syne', sans-serif", fontWeight: 600 }}>
              Edit profile
            </a>
          ) : authUser && viewerId ? (
            <FollowButton
              targetUserId={profile.id}
              initialFollowing={isFollowing}
              isPrivate={profile.is_private}
            />
          ) : (
            <a href="/login" style={{ background: '#1A9E5F', color: 'white', border: 'none', borderRadius: 20, padding: '9px 20px', fontSize: 14, fontWeight: 700, textDecoration: 'none', fontFamily: "'Syne', sans-serif" }}>
              Follow
            </a>
          )}
        </div>

        {/* Name */}
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: '#F0F0EC', letterSpacing: '-0.01em', marginBottom: 2 }}>
          {profile.display_name}
          {profile.is_monetised && <span style={{ marginLeft: 8, fontSize: 11, background: '#D4A017', color: '#000', padding: '2px 7px', borderRadius: 4, fontWeight: 700, verticalAlign: 'middle' }}>PRO</span>}
        </h1>
        <p style={{ fontSize: 15, color: '#44444A', marginBottom: 10 }}>@{profile.username}</p>

        {profile.bio && <p style={{ fontSize: 15, color: '#C0C0B8', lineHeight: 1.65, marginBottom: 12 }}>{profile.bio}</p>}

        {/* Meta */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
          {profile.location && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: '#44444A' }}><MapPin size={14} />{profile.location}</span>}
          {profile.website_url && (
            <a href={profile.website_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: '#1A9E5F', textDecoration: 'none' }}>
              <LinkIcon size={14} />{profile.website_url.replace(/^https?:\/\//, '')}
            </a>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: '#44444A' }}><Calendar size={14} />Joined {joinDate}</span>
        </div>

        {/* Counts */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 4 }}>
          {[
            { value: formatNumber(profile.following_count), label: 'Following' },
            { value: formatNumber(profile.followers_count), label: 'Followers' },
          ].map(({ value, label }) => (
            <div key={label} style={{ cursor: 'pointer' }}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: '#F0F0EC' }}>{value}</span>
              {' '}<span style={{ fontSize: 14, color: '#44444A' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderTop: '1px solid #1E1E26', borderBottom: '1px solid #1E1E26', marginTop: 16 }}>
        {['Posts', 'Replies', 'Media', 'Likes'].map((tab, i) => (
          <button key={tab} style={{
            flex: 1, padding: '14px 0', background: 'none', border: 'none',
            color: i === 0 ? '#F0F0EC' : '#44444A', fontFamily: "'Syne', sans-serif",
            fontWeight: 600, fontSize: 14, cursor: 'pointer',
            borderBottom: i === 0 ? '2px solid #1A9E5F' : '2px solid transparent',
          }}>{tab}</button>
        ))}
      </div>

      {/* Private account lock */}
      {profile.is_private && !canSeePosts && (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#1A1A20', border: '1px solid #2A2A30', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Lock size={24} color="#44444A" />
          </div>
          <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: '#F0F0EC', marginBottom: 8 }}>This account is private</h3>
          <p style={{ fontSize: 14, color: '#44444A' }}>Follow this account to see their posts.</p>
        </div>
      )}

      {/* Posts */}
      {canSeePosts && posts.length === 0 && (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: '#44444A' }}>No posts yet.</p>
        </div>
      )}
      {canSeePosts && posts.map((post: any) => (
        <PostCard key={post.id} post={{ ...post, is_liked: false, is_bookmarked: false, is_reposted: false }} />
      ))}
    </div>
  )
}