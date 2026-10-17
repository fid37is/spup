// src/app/(main)/post/[id]/deleted-post.tsx
//
// What a post / comment link lands on when the post is gone (deleted by its
// author or by moderation, or never existed). Replaces the generic 404 so a tap
// on an old notification, shared link or reply ends on a clear explanation with
// a way forward - not a dead "page doesn't exist".
//
// A deleted comment still knows its parent when the row is readable, so we offer
// to open the post it was written under.

import Link from 'next/link'
import { ArrowLeft, Trash2 } from 'lucide-react'
import BackButton from './back-button'
import HideMobileHeader from '@/components/layout/hide-mobile-header'

export default function DeletedPost({ parentPostId = null, isReply = false }: {
  parentPostId?: string | null
  isReply?: boolean
}) {
  const noun = isReply ? 'comment' : 'post'
  return (
    <div style={{ minHeight: '100dvh' }}>
      <HideMobileHeader />
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 16,
        padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 20px 14px',
      }}>
        <BackButton parentPostId={null}><ArrowLeft size={20} /></BackButton>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)', margin: 0 }}>
          {isReply ? 'Comment' : 'Post'}
        </h1>
      </div>

      <div style={{ padding: '72px 28px', textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px',
          background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--color-text-muted)',
        }}>
          <Trash2 size={30} strokeWidth={1.6} />
        </div>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 21, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
          This {noun} was deleted
        </h2>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.6, maxWidth: 320, margin: '0 auto 28px' }}>
          It&apos;s no longer available. The person who wrote it may have removed it.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {parentPostId && (
            <Link href={`/post/${parentPostId}`} style={{
              padding: '11px 24px', borderRadius: 24, textDecoration: 'none',
              background: 'var(--color-brand)', color: '#fff', fontWeight: 600, fontSize: 14,
            }}>
              View the original post
            </Link>
          )}
          <Link href="/feed" style={{
            padding: '11px 24px', borderRadius: 24, textDecoration: 'none', fontWeight: 600, fontSize: 14,
            ...(parentPostId
              ? { color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }
              : { background: 'var(--color-brand)', color: '#fff' }),
          }}>
            Back to feed
          </Link>
        </div>
      </div>
    </div>
  )
}
