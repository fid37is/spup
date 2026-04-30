'use client'

/**
 * ProfilePageClient
 * ──────────────────
 * Client-side wrapper for /profile (own profile).
 * Manages edit-modal open state — the profile page itself is still a
 * server component that fetches data; this component handles interactivity.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ProfileHeader from '@/components/profile/profile-header'
import EditProfileModal from '@/components/profile/edit-profile-modal'
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
  }
  initialPosts: FeedPost[]
}

export default function ProfilePageClient({ profile, stats, initialPosts }: Props) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)

  return (
    <>
      <ProfileHeader
        profile={profile}
        stats={stats}
        isOwner={true}
        onEditProfile={() => setEditOpen(true)}
      />

      {editOpen && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditOpen(false)}
          onSaved={() => router.refresh()}
        />
      )}

      <ProfileTabs
        profileId={profile.id}
        initialPosts={initialPosts}
        isOwner={true}
        canSeeContent={true}
      />
    </>
  )
}