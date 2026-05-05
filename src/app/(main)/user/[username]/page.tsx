// src/app/(main)/user/[username]/page.tsx
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { getProfileByUsername, getUserPosts } from '@/lib/queries'
import { formatNumber } from '@/lib/utils'
import { Lock } from 'lucide-react'
import Link from 'next/link'
import FollowButton from './follow-button'
import ProfileHeader from '@/components/profile/profile-header'
import ProfileTabs from '@/components/profile/profile-tabs'
import type { FeedPost } from '@/lib/actions/feed'
import type { Metadata } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

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
      siteName: 'Spup', locale: 'en_NG',
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

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params

  const profile = await getProfileByUsername(username)
  if (!profile || profile.status === 'banned') notFound()

  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const admin = createAdminClient()

  let viewerProfileId: string | null = null
  let isOwnProfile = false
  let isFollowing  = false
  let followsMe    = false

  if (authUser) {
    const { data: viewer } = await admin
      .from('users').select('id').eq('auth_id', authUser.id).single()
    if (viewer) {
      viewerProfileId = viewer.id
      isOwnProfile    = viewer.id === profile.id

      if (!isOwnProfile) {
        const [{ data: follow }, { data: reverse }] = await Promise.all([
          admin.from('follows').select('id')
            .match({ follower_id: viewer.id, following_id: profile.id })
            .maybeSingle(),
          admin.from('follows').select('id')
            .match({ follower_id: profile.id, following_id: viewer.id })
            .maybeSingle(),
        ])
        isFollowing = !!follow
        followsMe   = !!reverse
      }
    }
  }

  if (isOwnProfile) redirect('/profile')

  const canSeeContent = !profile.is_private || isFollowing
  const rawPosts      = canSeeContent ? await getUserPosts(profile.id, 20) : []

  // Hydrate engagement for viewer
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

  // Recalculate all counts from actual rows — never trust denormalized counters
  const [
    { data: youFollowRows },
    { data: followYouRows },
    { count: actualPostsCount },
  ] = await Promise.all([
    admin.from('follows').select('following_id').eq('follower_id', profile.id),
    admin.from('follows').select('follower_id').eq('following_id', profile.id),
    admin.from('posts').select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id).is('deleted_at', null)
      .is('parent_post_id', null).neq('post_type', 'repost'),
  ])

  const followingSet = new Set((youFollowRows  || []).map((r: any) => r.following_id as string))
  const followerSet  = new Set((followYouRows  || []).map((r: any) => r.follower_id  as string))
  const mutualsCount = [...followingSet].filter(id => followerSet.has(id)).length

  const stats = {
    following: formatNumber(followingSet.size),
    followers: formatNumber(followerSet.size),
    posts:     formatNumber(actualPostsCount ?? 0),
    mutuals:   formatNumber(mutualsCount),
  }

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
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/WriteAction',  userInteractionCount: profile.posts_count    ?? 0 },
    ],
    memberOf: { '@type': 'Organization', name: 'Spup', url: BASE_URL },
  }

  const actionSlot = authUser && viewerProfileId ? (
    <FollowButton
      targetUserId={profile.id}
      initialFollowing={isFollowing}
      followsMe={followsMe}
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
  )

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <ProfileHeader
        profile={profile}
        stats={stats}
        isOwner={false}
        actionSlot={actionSlot}
      />

      {/* Private account lock */}
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
          <h3 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 17,
            color: 'var(--color-text-primary)', marginBottom: 8,
          }}>
            This account is private
          </h3>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
            Follow to see their posts.
          </p>
        </div>
      )}

      <ProfileTabs
        profileId={profile.id}
        initialPosts={initialPosts}
        isOwner={false}
        canSeeContent={canSeeContent}
        currentUserId={viewerProfileId ?? undefined}
      />
    </div>
  )
}