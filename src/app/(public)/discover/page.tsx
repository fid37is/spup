// src/app/(public)/discover/page.tsx
//
// Public hub: latest posts, items for sale, and creators to follow. This is
// the crawlable front door to the feed - the homepage and footer link here,
// and every card links on to a /p/[id] or /u/[username] page.

import type { Metadata } from 'next'
import Link from 'next/link'
import PublicPostCard, { PublicAvatar } from '@/components/public/public-post-card'
import { getLatestPublicPosts, getTopCreators } from '@/lib/public-data'

export const revalidate = 120

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

export const metadata: Metadata = {
  title: 'Discover - latest posts, items for sale and creators',
  description:
    "See what Nigerians are posting on Spup right now: conversations in English, Pidgin, Yoruba, Igbo and Hausa, items for sale with escrow protection, and creators to follow.",
  alternates: { canonical: `${BASE_URL}/discover` },
  robots: { index: true, follow: true },
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, margin: '0 0 14px' }}>
      {children}
    </h2>
  )
}

export default async function DiscoverPage() {
  const [latest, selling, creators] = await Promise.all([
    getLatestPublicPosts(20),
    getLatestPublicPosts(6, { sellingOnly: true }),
    getTopCreators(12),
  ])

  return (
    <div style={{ padding: '28px 20px 0' }}>
      <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 'clamp(28px, 6vw, 38px)', margin: '0 0 8px', letterSpacing: '-0.03em' }}>
        Discover Spup
      </h1>
      <p style={{ margin: '0 0 28px', color: 'var(--color-text-secondary)', fontSize: 15, lineHeight: 1.6 }}>
        Real conversations from Nigeria&apos;s social platform. Log in to reply, follow and shop with escrow protection.
      </p>

      {creators.length > 0 && (
        <section aria-label="Creators to follow" style={{ marginBottom: 32 }}>
          <SectionTitle>Creators to follow</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {creators.map(c => (
              <Link key={c.id} href={`/u/${c.username}`} style={{
                display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 14, padding: '12px 14px', minWidth: 0,
              }}>
                <PublicAvatar name={c.display_name} src={c.avatar_url} size={40} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.display_name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    @{c.username} · {c.followers_count} followers
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {selling.length > 0 && (
        <section aria-label="Items for sale" style={{ marginBottom: 32 }}>
          <SectionTitle>For sale on Spup</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {selling.map(p => <PublicPostCard key={p.id} post={p} variant="feed" />)}
          </div>
        </section>
      )}

      <section aria-label="Latest posts">
        <SectionTitle>Latest posts</SectionTitle>
        {latest.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Nothing to show yet - check back soon.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {latest.map(p => <PublicPostCard key={p.id} post={p} variant="feed" />)}
          </div>
        )}
      </section>
    </div>
  )
}
