// src/components/public/public-post-card.tsx
//
// Read-only post card for logged-out visitors and crawlers. Pure server
// component: no hooks, no client JS, no auth. The real text is in the HTML,
// which is the whole point - it's what Google (and AdSense review) reads.

import Link from 'next/link'
import { Heart, MessageCircle, Repeat2, Tag } from 'lucide-react'
import type { PublicPost } from '@/lib/public-data'

const TOKEN_RE = /(?<![\w@])@[a-zA-Z0-9_]{3,20}\b|(?<![\w#])#[a-zA-Z][a-zA-Z0-9_]{0,49}\b/g

// Mentions link to the PUBLIC profile page; hashtags are styled but not linked
// (hashtag search lives behind the login).
function renderBody(text: string) {
  const out: React.ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0
    if (idx > last) out.push(text.slice(last, idx))
    const tok = m[0]
    if (tok.startsWith('@')) {
      out.push(
        <Link key={i++} href={`/u/${tok.slice(1).toLowerCase()}`}
          style={{ color: 'var(--color-brand)', textDecoration: 'none' }}>
          {tok}
        </Link>,
      )
    } else {
      out.push(<span key={i++} style={{ color: 'var(--color-brand)' }}>{tok}</span>)
    }
    last = idx + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Avatar({ name, src, size = 42 }: { name: string; src: string | null; size?: number }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={`${name}'s profile photo`} width={size} height={size} loading="lazy"
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    )
  }
  return (
    <div aria-hidden style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'var(--color-brand)', color: 'white',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: size * 0.36,
    }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}

export function PublicAvatar(props: { name: string; src: string | null; size?: number }) {
  return <Avatar {...props} />
}

export default function PublicPostCard({
  post, variant = 'feed',
}: {
  post: PublicPost
  variant?: 'feed' | 'full'
}) {
  const full = variant === 'full'
  const body = (post.body ?? '').trim()
  const clipped = !full && body.length > 280 ? body.slice(0, 280).trimEnd() + '…' : body
  const media = post.media.slice(0, 4)
  const href = `/p/${post.id}`

  return (
    <article style={{
      background: full ? 'transparent' : 'var(--color-surface)',
      border: full ? 'none' : '1px solid var(--color-border)',
      borderBottom: full ? '1px solid var(--color-border)' : undefined,
      borderRadius: full ? 0 : 16,
      padding: full ? '20px 20px 16px' : '18px 18px 14px',
      height: full ? undefined : '100%',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href={`/u/${post.author.username}`} style={{ textDecoration: 'none' }}>
          <Avatar name={post.author.display_name} src={post.author.avatar_url} />
        </Link>
        <div style={{ minWidth: 0 }}>
          <Link href={`/u/${post.author.username}`} style={{
            display: 'block', textDecoration: 'none', fontWeight: 700, fontSize: 15,
            color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {post.author.display_name}
          </Link>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>@{post.author.username}</span>
        </div>
        {post.is_selling && (
          <span style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'var(--color-brand-muted)', border: '1px solid var(--color-brand-border)',
            color: 'var(--color-brand)', borderRadius: 100, padding: '3px 10px',
            fontSize: 12, fontWeight: 700,
          }}>
            <Tag size={12} /> For sale
          </span>
        )}
      </header>

      {body && (
        <p style={{
          margin: 0, fontSize: full ? 18 : 15, lineHeight: 1.65, whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere', color: 'var(--color-text-primary)',
        }}>
          {renderBody(clipped)}
          {clipped !== body && (
            <>
              {' '}
              <Link href={href} style={{ color: 'var(--color-brand)', textDecoration: 'none', fontWeight: 600 }}>
                Read more
              </Link>
            </>
          )}
        </p>
      )}

      {media.length > 0 && (
        <div style={{
          display: 'grid', gap: 6, borderRadius: 12, overflow: 'hidden',
          gridTemplateColumns: media.length === 1 ? '1fr' : '1fr 1fr',
        }}>
          {media.map(m =>
            m.media_type === 'video' ? (
              <video key={m.id} src={m.url} poster={m.thumbnail_url ?? undefined}
                controls preload="none" playsInline
                style={{ width: '100%', maxHeight: full ? 520 : 260, background: '#000' }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={m.id} src={m.url} loading="lazy"
                alt={`Photo posted by @${post.author.username} on Spup`}
                style={{
                  width: '100%', objectFit: 'cover',
                  maxHeight: full ? 520 : 260, aspectRatio: media.length === 1 ? undefined : '1 / 1',
                }} />
            ),
          )}
        </div>
      )}

      <footer style={{
        display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
        fontSize: 13, color: 'var(--color-text-muted)', marginTop: 'auto',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Heart size={14} /> {post.likes_count}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MessageCircle size={14} /> {post.comments_count}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Repeat2 size={14} /> {post.reposts_count}</span>
        <Link href={href} style={{ marginLeft: 'auto', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
          <time dateTime={post.created_at}>{formatDate(post.created_at)}</time>
        </Link>
      </footer>
    </article>
  )
}
