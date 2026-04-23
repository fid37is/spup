import { createClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { getProfileByAuthId, getOnboardingProgress } from '@/lib/queries'
import { getUserPosts } from '@/lib/queries'
import { formatNumber } from '@/lib/utils'
import { MapPin, LinkIcon, Calendar, Settings } from 'lucide-react'
import Link from 'next/link'
import PostCard from '@/components/feed/post-card'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfileByAuthId(user.id)
  if (!profile) redirect('/login')

  const posts = await getUserPosts(profile.id, 20)
  const joinDate = new Date(profile.created_at).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })
  const initials = profile.display_name?.slice(0, 2).toUpperCase() || 'PA'

  return (
    <div>
      {/* Banner */}
      <div style={{ height: 120, background: 'linear-gradient(135deg, #0A2016 0%, #1A3A20 50%, #0F2510 100%)', position: 'relative' }} />

      <div style={{ padding: '0 20px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
          <div style={{
            width: 84, height: 84, borderRadius: '50%',
            background: 'linear-gradient(135deg, #1A7A4A, #22A861)',
            border: '4px solid #0A0A0A', marginTop: -42,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 30, color: 'white',
            position: 'relative', zIndex: 1,
          }}>
            {initials}
            {profile.verification_tier !== 'none' && (
              <div style={{ position: 'absolute', bottom: 2, right: 2, width: 22, height: 22, borderRadius: '50%', background: '#1A7A4A', border: '2px solid #0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'white' }}>✓</div>
            )}
          </div>
          <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #2A2A2A', borderRadius: 20, padding: '8px 16px', textDecoration: 'none', color: '#F5F5F0', fontSize: 14, fontFamily: "'Syne', sans-serif", fontWeight: 600 }}>
            <Settings size={14} /> Edit profile
          </Link>
        </div>

        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: '#F5F5F0', letterSpacing: '-0.01em', marginBottom: 2 }}>
          {profile.display_name}
          {profile.is_monetised && <span style={{ marginLeft: 8, fontSize: 11, background: '#D4A017', color: '#000', padding: '2px 7px', borderRadius: 4, fontWeight: 700, verticalAlign: 'middle' }}>PRO</span>}
        </h1>
        <p style={{ fontSize: 15, color: '#555', marginBottom: 10 }}>@{profile.username}</p>

        {profile.bio && <p style={{ fontSize: 15, color: '#C0C0B8', lineHeight: 1.65, marginBottom: 12 }}>{profile.bio}</p>}

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
          {profile.location && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: '#555' }}><MapPin size={14} />{profile.location}</span>}
          {profile.website_url && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: '#22A861' }}><LinkIcon size={14} />{profile.website_url}</span>}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: '#555' }}><Calendar size={14} />Joined {joinDate}</span>
        </div>

        <div style={{ display: 'flex', gap: 24, marginBottom: 4 }}>
          {[
            { value: formatNumber(profile.following_count), label: 'Following' },
            { value: formatNumber(profile.followers_count), label: 'Followers' },
            { value: formatNumber(profile.posts_count), label: 'Posts' },
          ].map(({ value, label }) => (
            <div key={label} style={{ cursor: 'pointer' }}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: '#F5F5F0' }}>{value}</span>
              {' '}<span style={{ fontSize: 14, color: '#555' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', borderTop: '1px solid #1A1A1A', borderBottom: '1px solid #1A1A1A', marginTop: 16 }}>
        {['Posts', 'Replies', 'Media', 'Likes'].map((tab, i) => (
          <button key={tab} style={{
            flex: 1, padding: '14px 0', background: 'none', border: 'none',
            color: i === 0 ? '#F5F5F0' : '#555', fontFamily: "'Syne', sans-serif",
            fontWeight: 600, fontSize: 14,
            borderBottom: i === 0 ? '2px solid #22A861' : '2px solid transparent',
            cursor: 'pointer',
          }}>{tab}</button>
        ))}
      </div>

      {posts.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✍️</div>
          <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: '#F5F5F0', marginBottom: 8 }}>No posts yet</h3>
          <p style={{ fontSize: 14, color: '#555' }}>Share your first para with the world</p>
        </div>
      ) : (
        posts.map((post: any) => <PostCard key={post.id} post={{ ...post, is_liked: false, is_bookmarked: false, is_reposted: false }} />)
      )}
    </div>
  )
}
