'use client'

// src/app/(main)/post/[id]/parent-context-card.tsx
//
// Shown above the main post when it is itself a reply - a small, muted
// preview of what it's replying to, connected by a thread line, matching how
// Threads always shows a reply's parent for context. Tapping it opens the
// parent's own page (recursing "upward" through the same page template).

import { useRouter } from 'next/navigation'
import { cloudinaryImage, fallbackToOriginal } from '@/lib/utils/cloudinary'

interface ParentPost {
  id: string
  body: string | null
  author: { username: string; display_name: string; avatar_url: string | null }
}

export default function ParentContextCard({ post }: { post: ParentPost }) {
  const router = useRouter()

  return (
    <div
      onClick={() => router.push(`/post/${post.id}`)}
      role="button"
      style={{
        display: 'flex', gap: 12, padding: '12px 16px 0', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 36, flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
          background: post.author.avatar_url ? 'transparent' : 'var(--color-surface-3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 11, color: 'var(--color-text-secondary)',
        }}>
          {post.author.avatar_url
            ? <img src={cloudinaryImage(post.author.avatar_url, 64)} alt="" loading="lazy" decoding="async"
                onError={fallbackToOriginal(post.author.avatar_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : (post.author.display_name || post.author.username).slice(0, 2).toUpperCase()}
        </div>
        <div style={{ width: 2, flex: 1, minHeight: 8, background: 'var(--color-border)', marginTop: 4 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
          <span style={{ fontWeight: 700, color: 'var(--color-text-secondary)', fontFamily: "'Syne', sans-serif" }}>
            {post.author.display_name || post.author.username}
          </span>
          <span style={{ color: 'var(--color-text-faint)' }}>@{post.author.username}</span>
        </div>
        {post.body?.trim() && (
          <p style={{
            margin: '2px 0 0', fontSize: 14, lineHeight: 1.45, color: 'var(--color-text-faint)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {post.body}
          </p>
        )}
      </div>
    </div>
  )
}
