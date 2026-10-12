'use client'

// src/app/(main)/post/[id]/activity/likes/likers-list.tsx
//
// Everyone who liked the post, each with a Follow button so people can follow each other
// straight from here. The first page comes from the server; the rest load as you scroll
// (or with the button, if scrolling can't trigger it).

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import SidebarFollowBtn from '@/components/layout/sidebar-follow-btn'
import { formatNumber } from '@/lib/utils'
import type { PostLiker } from '@/lib/queries/posts'
import { loadMoreLikersAction } from './actions'

function Avatar({ name, avatarUrl, size = 44 }: { name: string; avatarUrl?: string | null; size?: number }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={name} width={size} height={size} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, fontFamily: "'Syne',sans-serif",
    }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}

export default function LikersList({
  postId, sort, viewerProfileId, initialLikers, initialNextOffset, initialHasMore,
}: {
  postId: string
  sort: 'recent' | 'top'
  viewerProfileId?: string
  initialLikers: PostLiker[]
  initialNextOffset: number
  initialHasMore: boolean
}) {
  const [likers, setLikers] = useState(initialLikers)
  const [nextOffset, setNextOffset] = useState(initialNextOffset)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const busy = useRef(false)
  const sentinel = useRef<HTMLDivElement>(null)

  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore) return
    busy.current = true
    setLoading(true)
    setFailed(false)
    try {
      const page = await loadMoreLikersAction(postId, sort, nextOffset)
      setLikers(prev => {
        const seen = new Set(prev.map(l => l.id))
        return [...prev, ...page.likers.filter(l => !seen.has(l.id))]
      })
      setNextOffset(page.nextOffset)
      setHasMore(page.hasMore)
    } catch {
      setFailed(true)
    } finally {
      busy.current = false
      setLoading(false)
    }
  }, [postId, sort, nextOffset, hasMore])

  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasMore || failed) return
    const io = new IntersectionObserver(entries => { if (entries[0].isIntersecting) void loadMore() }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, failed, loadMore])

  if (likers.length === 0) {
    return (
      <div style={{ padding: '48px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--color-text-faint)' }}>No likes yet.</p>
      </div>
    )
  }

  return (
    <>
      {likers.map(liker => (
        <div key={liker.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 20px', borderBottom: '1px solid var(--color-border)',
        }}>
          <Link href={`/user/${liker.username}`} style={{ flexShrink: 0 }}>
            <Avatar name={liker.display_name || liker.username} avatarUrl={liker.avatar_url} />
          </Link>
          <Link href={`/user/${liker.username}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {liker.username}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {liker.display_name}
            </div>
            {liker.followers_count > 0 && (
              <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 2 }}>
                {formatNumber(liker.followers_count)} followers
              </div>
            )}
          </Link>
          {liker.id !== viewerProfileId && (
            <SidebarFollowBtn targetUserId={liker.id} initialFollowing={liker.is_following} followsMe={liker.follows_me} />
          )}
        </div>
      ))}

      {hasMore && (
        <div ref={sentinel} style={{ display: 'flex', justifyContent: 'center', padding: '18px 0 8px' }}>
          {failed ? (
            <button
              onClick={() => void loadMore()}
              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 20, padding: '8px 18px', cursor: 'pointer', color: 'var(--color-brand)', fontSize: 13, fontWeight: 600 }}
            >
              Couldn&apos;t load more - try again
            </button>
          ) : loading ? (
            <Loader2 size={20} color="var(--color-brand)" style={{ animation: 'spin 0.8s linear infinite' }} />
          ) : (
            <button
              onClick={() => void loadMore()}
              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 20, padding: '8px 18px', cursor: 'pointer', color: 'var(--color-brand)', fontSize: 13, fontWeight: 600 }}
            >
              Show more
            </button>
          )}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}
