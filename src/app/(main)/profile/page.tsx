// src/app/(main)/profile/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getProfileByAuthId } from '@/lib/queries'
import { getUserPosts } from '@/lib/queries'
import { formatNumber } from '@/lib/utils'
import PostCard from '@/components/feed/post-card'
import ProfileHeader from '@/components/profile/profile-header'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfileByAuthId(user.id)
  if (!profile) redirect('/login')

  const posts = await getUserPosts(profile.id, 20)

  // Format numbers server-side — never pass functions to client components
  const stats = {
    following: formatNumber(profile.following_count ?? 0),
    followers: formatNumber(profile.followers_count ?? 0),
    posts:     formatNumber(profile.posts_count ?? 0),
  }

  return (
    <div>
      <ProfileHeader
        profile={profile}
        stats={stats}
        isOwner={true}
      />

      {/* ── Tabs ── */}
      <div style={{
        display: 'flex',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        marginTop: 16,
      }}>
        {['Posts', 'Replies', 'Media', 'Likes'].map((tab, i) => (
          <button key={tab} style={{
            flex: 1, padding: '14px 0',
            background: 'none', border: 'none',
            color: i === 0 ? 'var(--text-primary)' : 'var(--text-muted)',
            fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 14,
            borderBottom: i === 0 ? '2px solid var(--spup-green)' : '2px solid transparent',
            cursor: 'pointer',
          }}>
            {tab}
          </button>
        ))}
      </div>

      {/* ── Posts ── */}
      {posts.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✍️</div>
          <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', marginBottom: 8 }}>
            No posts yet
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Share your first post with the world</p>
        </div>
      ) : (
        posts.map((post: any) => (
          <PostCard key={post.id} post={{ ...post, is_liked: false, is_bookmarked: false, is_reposted: false }} />
        ))
      )}
    </div>
  )
}