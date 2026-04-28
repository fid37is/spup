import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import PostCard from '@/components/feed/post-card'
import ReplyComposer from './reply-composer'
import { formatNumber } from '@/lib/utils'
import type { Metadata } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

const POST_SELECT = `
  id, body, post_type, likes_count, dislikes_count, comments_count, reposts_count,
  bookmarks_count, impressions_count, created_at, edited_at, is_sensitive,
  author:users!posts_user_id_fkey(id, username, display_name, avatar_url, verification_tier, is_monetised),
  media:post_media(id, media_type, url, thumbnail_url, width, height, position)
`

// ── Dynamic metadata ────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()

  const { data: post } = await supabase
    .from('posts')
    .select('id, body, is_sensitive, created_at, author:users!posts_user_id_fkey(username, display_name, avatar_url), media:post_media(url, media_type)')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!post) return { title: 'Post not found' }

  const author = post.author as any
  const snippet = post.body?.slice(0, 160) ?? ''
  const title = `${author?.display_name ?? 'Someone'} on Spup: "${snippet}"`
  const description = post.is_sensitive
    ? `Post by @${author?.username} — may contain sensitive content.`
    : snippet || `Post by @${author?.username} on Spup`

  // Use first image media if present, otherwise author avatar, else default OG
  const media = (post.media as any[]) ?? []
  const firstImage = media.find(m => m.media_type === 'image')
  const ogImage = post.is_sensitive
    ? `${BASE_URL}/og/default.png`
    : firstImage?.url ?? author?.avatar_url ?? `${BASE_URL}/og/default.png`

  const postUrl = `${BASE_URL}/post/${id}`

  return {
    title,
    description,
    alternates: { canonical: postUrl },
    openGraph: {
      type: 'article',
      title,
      description,
      url: postUrl,
      siteName: 'Spup',
      locale: 'en_NG',
      publishedTime: post.created_at,
      authors: [`${BASE_URL}/user/${author?.username}`],
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `Post by @${author?.username} on Spup`,
        },
      ],
    },
    twitter: {
      card: firstImage ? 'summary_large_image' : 'summary',
      site: '@spupng',
      creator: `@${author?.username ?? 'spupng'}`,
      title,
      description,
      images: [ogImage],
    },
    robots: { index: !post.is_sensitive, follow: true },
  }
}

// ── Data fetching ────────────────────────────────────────────────────────────

async function getPost(supabase: Awaited<ReturnType<typeof createClient>>, postId: string, viewerId: string | null) {
  const { data: post } = await supabase
    .from('posts').select(POST_SELECT)
    .eq('id', postId).is('deleted_at', null).single()

  if (!post) return null

  const { data: replies } = await supabase
    .from('posts').select(POST_SELECT)
    .eq('parent_post_id', postId).is('deleted_at', null)
    .order('created_at', { ascending: true }).limit(50)

  const replyIds = (replies || []).map((r: any) => r.id)
  const { data: nestedReplies } = replyIds.length > 0
    ? await supabase.from('posts').select(POST_SELECT)
        .in('parent_post_id', replyIds).is('deleted_at', null)
        .order('created_at', { ascending: true }).limit(100)
    : { data: [] }

  const nestedByParent = (nestedReplies || []).reduce((acc: Record<string, any[]>, r: any) => {
    if (!acc[r.parent_post_id]) acc[r.parent_post_id] = []
    acc[r.parent_post_id].push(r)
    return acc
  }, {})

  if (viewerId) {
    const { data: viewer } = await supabase
      .from('users').select('id').eq('auth_id', viewerId).maybeSingle()

    if (viewer) {
      const allIds = [post.id, ...(replies || []).map((r: any) => r.id), ...(nestedReplies || []).map((r: any) => r.id)]
      const [{ data: likes }, { data: dislikes }, { data: bookmarks }, { data: reposts }] = await Promise.all([
        supabase.from('likes').select('post_id').eq('user_id', viewer.id).in('post_id', allIds),
        supabase.from('dislikes').select('post_id').eq('user_id', viewer.id).in('post_id', allIds),
        supabase.from('bookmarks').select('post_id').eq('user_id', viewer.id).in('post_id', allIds),
        supabase.from('posts').select('parent_post_id').eq('user_id', viewer.id).eq('post_type', 'repost').in('parent_post_id', allIds),
      ])
      const likedSet = new Set((likes || []).map((l: any) => l.post_id))
      const dislikedSet = new Set((dislikes || []).map((d: any) => d.post_id))
      const bookmarkedSet = new Set((bookmarks || []).map((b: any) => b.post_id))
      const repostedSet = new Set((reposts || []).map((r: any) => r.parent_post_id))

      const hydrate = (p: any) => ({
        ...p,
        is_liked: likedSet.has(p.id),
        is_disliked: dislikedSet.has(p.id),
        is_bookmarked: bookmarkedSet.has(p.id),
        is_reposted: repostedSet.has(p.id),
      })

      return {
        post: hydrate(post),
        replies: (replies || []).map((r: any) => ({ ...hydrate(r), nested: (nestedByParent[r.id] || []).map(hydrate) })),
      }
    }
  }

  return {
    post: { ...post, is_liked: false, is_disliked: false, is_bookmarked: false, is_reposted: false },
    replies: (replies || []).map((r: any) => ({
      ...r, is_liked: false, is_disliked: false, is_bookmarked: false, is_reposted: false,
      nested: (nestedByParent[r.id] || []).map((n: any) => ({ ...n, is_liked: false, is_disliked: false, is_bookmarked: false, is_reposted: false })),
    })),
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const data = await getPost(supabase, id, user.id)
  if (!data) notFound()

  const { post, replies } = data

  const { data: viewer } = await supabase
    .from('users').select('display_name, avatar_url').eq('auth_id', user.id).maybeSingle()
  const viewerInitial = viewer?.display_name?.slice(0, 2).toUpperCase() ?? '?'
  const viewerAvatar = viewer?.avatar_url ?? null

  const date = new Date(post.created_at).toLocaleString('en-NG', {
    hour: '2-digit', minute: '2-digit',
    day: 'numeric', month: 'short', year: 'numeric',
  })

  // Structured data for this specific post
  const author = post.author as any
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SocialMediaPosting',
    headline: post.body?.slice(0, 110),
    articleBody: post.body,
    datePublished: post.created_at,
    dateModified: post.edited_at ?? post.created_at,
    url: `${BASE_URL}/post/${id}`,
    author: {
      '@type': 'Person',
      name: author?.display_name,
      url: `${BASE_URL}/user/${author?.username}`,
      image: author?.avatar_url,
    },
    interactionStatistic: [
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: post.likes_count },
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: post.comments_count },
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/ShareAction', userInteractionCount: post.reposts_count },
    ],
    publisher: {
      '@type': 'Organization',
      name: 'Spup',
      url: BASE_URL,
      logo: { '@type': 'ImageObject', url: `${BASE_URL}/logo.png` },
    },
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px',
      }}>
        <Link href="/feed" style={{ color: 'var(--color-text-primary)', display: 'flex' }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)' }}>
          Post
        </h1>
      </div>

      {/* Main post */}
      <PostCard post={post} />

      {/* Timestamp + views */}
      <div style={{
        padding: '10px 20px 12px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{date}</span>
        {post.impressions_count > 0 && (
          <>
            <span style={{ color: 'var(--color-border-light)' }}>·</span>
            <span style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 600 }}>
              {formatNumber(post.impressions_count)}
            </span>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Views</span>
          </>
        )}
      </div>

      {/* Engagement totals row */}
      {(post.reposts_count > 0 || post.likes_count > 0 || post.dislikes_count > 0 || post.bookmarks_count > 0) && (
        <div style={{
          display: 'flex', gap: 20, padding: '12px 20px',
          borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap',
        }}>
          {post.reposts_count > 0 && <StatPill value={post.reposts_count} label="Reposts" />}
          {post.likes_count > 0 && <StatPill value={post.likes_count} label="Likes" />}
          {post.dislikes_count > 0 && <StatPill value={post.dislikes_count} label="Dislikes" />}
          {post.bookmarks_count > 0 && <StatPill value={post.bookmarks_count} label="Bookmarks" />}
        </div>
      )}

      {/* Reply composer */}
      <ReplyComposer parentPostId={id} viewerInitial={viewerInitial} viewerAvatar={viewerAvatar} />

      {/* Divider */}
      <div style={{ height: 8, background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)' }} />

      {/* Replies */}
      {replies.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-faint)' }}>No replies yet. Be the first!</p>
        </div>
      ) : (
        replies.map((reply: any) => (
          <div key={reply.id}>
            <PostCard post={reply} />
            {reply.nested && reply.nested.length > 0 && (
              <div style={{ position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 36, top: 0, bottom: 0,
                  width: 2, background: 'var(--color-border)',
                }} />
                {reply.nested.map((nested: any) => (
                  <div key={nested.id} style={{ position: 'relative' }}>
                    <PostCard post={nested} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <span style={{ fontSize: 15, color: 'var(--color-text-secondary)' }}>
      <strong style={{ color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif" }}>
        {formatNumber(value)}
      </strong>{' '}{label}
    </span>
  )
}