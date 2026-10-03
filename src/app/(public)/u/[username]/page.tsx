// src/app/(public)/u/[username]/page.tsx
//
// Public, crawlable profile page: bio, counts and recent posts for anyone,
// logged in or not. The in-app profile at /user/[username] is unchanged.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Lock } from 'lucide-react'
import PublicPostCard, { PublicAvatar } from '@/components/public/public-post-card'
import { getPublicProfile, getPublicProfilePosts } from '@/lib/public-data'

export const revalidate = 300

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> },
): Promise<Metadata> {
  const { username } = await params
  const profile = await getPublicProfile(username)
  if (!profile) return { title: 'User not found', robots: { index: false, follow: false } }

  const url = `${BASE_URL}/u/${profile.username}`
  const title = `${profile.display_name} (@${profile.username})`
  const description = profile.bio
    ? `${profile.bio.replace(/\s+/g, ' ').trim().slice(0, 140)} - @${profile.username} on Spup`
    : `@${profile.username} on Spup. ${profile.followers_count ?? 0} followers, ${profile.posts_count ?? 0} posts.`
  const image = profile.avatar_url ?? `${BASE_URL}/og/default.png`

  return {
    title, description,
    alternates: { canonical: url },
    robots: profile.is_private || !(profile.posts_count > 0)
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: { type: 'profile', title, description, url, siteName: 'Spup', locale: 'en_NG', images: [{ url: image }] },
    twitter: { card: 'summary', title, description, images: [image] },
  }
}

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const profile = await getPublicProfile(username)
  if (!profile) notFound()

  const posts = profile.is_private ? [] : await getPublicProfilePosts(profile.id)
  const stats = [
    { label: 'Posts', value: profile.posts_count ?? 0 },
    { label: 'Followers', value: profile.followers_count ?? 0 },
    { label: 'Following', value: profile.following_count ?? 0 },
  ]

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      name: profile.display_name,
      alternateName: `@${profile.username}`,
      url: `${BASE_URL}/u/${profile.username}`,
      description: profile.bio ?? undefined,
      image: profile.avatar_url ?? undefined,
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      {profile.banner_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.banner_url} alt="" style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
      ) : (
        <div aria-hidden style={{ height: 110, background: 'linear-gradient(135deg, var(--color-brand-dim), var(--color-brand))' }} />
      )}

      <div style={{ padding: '0 20px 18px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -38 }}>
          <div style={{ border: '4px solid var(--color-bg)', borderRadius: '50%', display: 'flex' }}>
            <PublicAvatar name={profile.display_name} src={profile.avatar_url} size={80} />
          </div>
          <Link href={`/login?redirectTo=/user/${profile.username}`} rel="nofollow" style={{
            background: 'var(--color-brand)', color: 'white', textDecoration: 'none',
            fontWeight: 700, fontSize: 14, padding: '9px 20px', borderRadius: 100,
          }}>
            Follow
          </Link>
        </div>

        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, margin: '12px 0 2px' }}>
          {profile.display_name}
        </h1>
        <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>@{profile.username}</div>

        {profile.bio && (
          <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {profile.bio}
          </p>
        )}
        {(profile.location || profile.website_url) && (
          <div style={{ marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: 'var(--color-text-muted)' }}>
            {profile.location && <span>{profile.location}</span>}
            {profile.website_url && (
              <a href={profile.website_url} rel="nofollow ugc noopener" target="_blank"
                style={{ color: 'var(--color-brand)', textDecoration: 'none' }}>
                {profile.website_url.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        )}

        <dl style={{ display: 'flex', gap: 24, margin: '16px 0 0' }}>
          {stats.map(s => (
            <div key={s.label}>
              <dd style={{ margin: 0, fontWeight: 800, fontSize: 17 }}>{s.value}</dd>
              <dt style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>

      {profile.is_private ? (
        <div style={{ padding: '56px 24px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          <Lock size={26} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>This account is private</div>
          <p style={{ fontSize: 14, marginTop: 6 }}>Log in and follow @{profile.username} to see their posts.</p>
        </div>
      ) : (
        <section aria-label={`Posts by @${profile.username}`} style={{ padding: '20px 20px 0' }}>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, margin: '0 0 14px' }}>Recent posts</h2>
          {posts.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>No public posts yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {posts.map(p => <PublicPostCard key={p.id} post={p} variant="feed" />)}
            </div>
          )}
        </section>
      )}
    </>
  )
}