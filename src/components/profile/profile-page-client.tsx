// src/components/profile/profile-page-client.tsx
'use client'

import ProfileHeader from '@/components/profile/profile-header'
import ProfileTabs from '@/components/profile/profile-tabs'
import type { FeedPost } from '@/lib/actions/feed'

interface Props {
  profile: {
    id: string
    display_name: string
    username: string
    avatar_url: string | null
    banner_url: string | null
    bio: string | null
    location: string | null
    website_url: string | null
    is_monetised: boolean
    verification_tier: string
    created_at: string
  }
  stats: {
    following: string
    followers: string
    posts: string
    mutuals: string
  }
  initialPosts: FeedPost[]
}

export default function ProfilePageClient({ profile, stats, initialPosts }: Props) {
  return (
    <>
      <ProfileHeader
        profile={profile}
        stats={stats}
        isOwner={true}
      />
      <ProfileTabs
        profileId={profile.id}
        initialPosts={initialPosts}
        isOwner={true}
        canSeeContent={true}
        currentUserId={profile.id}
      />
    </>
  )
}