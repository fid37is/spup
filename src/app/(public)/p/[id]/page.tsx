// src/app/(public)/p/[id]/page.tsx
//
// Public, crawlable post page. Same post as /post/[id] in the app, but it
// renders for anyone - no login, no redirect - with the text in the HTML.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import PublicPostCard from '@/components/public/public-post-card'
import { getPublicPost, getPublicReplies, isSubstantial } from '@/lib/public-data'

export const revalidate = 300

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

function clip(s: string, n: number) {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params
  const post = await getPublicPost(id)
  if (!post) return { title: 'Post not found', robots: { index: false, follow: false } }

  const url = `${BASE_URL}/p/${post.id}`
  const text = (post.body ?? '').trim()
  const title = `${post.author.display_name} on Spup: “${clip(text || 'Post', 58)}”`
  const description = clip(text || `A post by @${post.author.username} on Spup.`, 155)
  const image = post.media.find(m => m.media_type !== 'video')?.url
    ?? post.media[0]?.thumbnail_url ?? `${BASE_URL}/og/default.png`

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    // Thin one-liners stay viewable but out of the index.
    robots: isSubstantial(post) ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: 'article', title, description, url, siteName: 'Spup', locale: 'en_NG',
      publishedTime: post.created_at, images: [{ url: image }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

export default async function PublicPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const post = await getPublicPost(id)
  if (!post) notFound()

  // A reply isn't a page of its own - send it to the post it belongs to.
  if (post.parent_post_id) redirect(`/p/${post.parent_post_id}`)

  const replies = await getPublicReplies(post.id)
  const url = `${BASE_URL}/p/${post.id}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SocialMediaPosting',
    '@id': url,
    url,
    headline: clip(post.body ?? 'Post on Spup', 110),
    articleBody: post.body ?? '',
    datePublished: post.created_at,
    inLanguage: 'en-NG',
    author: {
      '@type': 'Person',
      name: post.author.display_name,
      url: `${BASE_URL}/u/${post.author.username}`,
    },
    commentCount: post.comments_count,
    interactionStatistic: {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/LikeAction',
      userInteractionCount: post.likes_count,
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        // Escape "<" so post text can never close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <Link href="/discover" style={{ color: 'var(--color-text-muted)', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
          ← Discover
        </Link>
      </div>

      <PublicPostCard post={post} variant="full" />

      {post.is_selling && (
        <div style={{
          margin: '16px 20px 0', padding: '16px 18px', borderRadius: 14,
          background: 'var(--color-brand-muted)', border: '1px solid var(--color-brand-border)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>This item is for sale</div>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            Message @{post.author.username} to agree the details. Pay through Spup and your money is held
            in escrow until you confirm delivery.
          </p>
          <Link href={`/login?redirectTo=/post/${post.id}`} style={{
            display: 'inline-block', background: 'var(--color-brand)', color: 'white', textDecoration: 'none',
            fontWeight: 700, fontSize: 14, padding: '9px 18px', borderRadius: 100,
          }}>
            Log in to message &amp; pay
          </Link>
        </div>
      )}

      <section aria-label="Replies" style={{ padding: '24px 20px 0' }}>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, margin: '0 0 14px' }}>
          {replies.length > 0 ? `Replies (${post.comments_count})` : 'No replies yet'}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {replies.map(r => <PublicPostCard key={r.id} post={r} variant="feed" />)}
        </div>
      </section>

      <div style={{
        margin: '28px 20px 0', padding: '22px 20px', borderRadius: 16, textAlign: 'center',
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, marginBottom: 6 }}>
          Join the conversation
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--color-text-secondary)' }}>
          Reply, like and follow @{post.author.username} on Spup, Nigeria&apos;s social platform.
        </p>
        <Link href="/signup" style={{
          display: 'inline-block', background: 'var(--color-brand)', color: 'white', textDecoration: 'none',
          fontWeight: 700, fontSize: 14, padding: '10px 22px', borderRadius: 100,
        }}>
          Create your account
        </Link>
      </div>
    </>
  )
}
