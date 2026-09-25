'use client'

// src/app/(main)/post/[id]/post-thread-client.tsx
//
// Thin client wrapper joining the (server-rendered) comments list to the
// reply composer: when the composer posts a reply, it's added to the list
// immediately via a ref, without a full page reload. Split out from page.tsx
// because a server component can't hold a ref or call a client-only hook.

import { useRef } from 'react'
import CommentsSection, { type CommentsSectionHandle } from '@/components/comments/comments-section'
import type { CommentData } from '@/components/comments/comment-row'
import ReplyComposer from './reply-composer'

type Comment = CommentData & { created_at: string; likes_count: number }

export default function PostThreadClient({
  postId, postAuthorId, viewerId, viewerName, viewerAvatar, viewerInitial,
  initialComments, sort, hasMore,
}: {
  postId: string
  postAuthorId: string
  viewerId?: string
  viewerName: string
  viewerAvatar: string | null
  viewerInitial: string
  initialComments: Comment[]
  sort: 'recent' | 'top'
  hasMore?: boolean
}) {
  const commentsRef = useRef<CommentsSectionHandle>(null)

  return (
    <>
      {/* Bottom padding matches the fixed mobile composer's height so the
          last comment is never hidden underneath it. Desktop's composer is
          sticky-in-flow, not fixed, so it needs no padding there. */}
      <div style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }} className="thread-comments-pad">
        <CommentsSection
          ref={commentsRef}
          postAuthorId={postAuthorId}
          viewerId={viewerId}
          initialComments={initialComments}
          sort={sort}
          hasMore={hasMore}
        />
      </div>
      <ReplyComposer
        parentPostId={postId}
        viewerInitial={viewerInitial}
        viewerAvatar={viewerAvatar}
        viewerName={viewerName}
        onPosted={post => commentsRef.current?.addComment(post)}
      />
      <style>{`
        /* The padding above is only needed on mobile, where the composer is
           position: fixed. Desktop keeps its sticky-in-flow composer, which
           already reserves its own space. */
        @media (min-width: 768px) {
          .thread-comments-pad { padding-bottom: 0; }
        }
      `}</style>
    </>
  )
}
