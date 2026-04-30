// src/app/(main)/profile/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import { getProfileByAuthId, getUserPosts } from '@/lib/queries'
import { formatNumber } from '@/lib/utils'
import ProfilePageClient from '@/components/profile/profile-page-client'
import type { FeedPost } from '@/lib/actions/feed'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfileByAuthId(user.id)
  if (!profile) redirect('/login')

  // Load the initial "Posts" tab data server-side
  const rawPosts = await getUserPosts(profile.id, 20)

  // Hydrate engagement state (viewer = themselves)
  const postIds = rawPosts.map((p: any) => p.id)
  let likedSet      = new Set<string>()
  let repostedSet   = new Set<string>()
  let bookmarkedSet = new Set<string>()

  if (postIds.length) {
    const [{ data: likes }, { data: reposts }, { data: bookmarks }] = await Promise.all([
      supabase.from('likes').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
      supabase.from('posts').select('parent_post_id').eq('user_id', profile.id).eq('post_type', 'repost').in('parent_post_id', postIds),
      supabase.from('bookmarks').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
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

  const stats = {
    following: formatNumber(profile.following_count ?? 0),
    followers: formatNumber(profile.followers_count ?? 0),
    posts:     formatNumber(profile.posts_count     ?? 0),
  }

  return (
    <div>
      <ProfilePageClient
        profile={profile}
        stats={stats}
        initialPosts={initialPosts}
      />
    </div>
  )
}