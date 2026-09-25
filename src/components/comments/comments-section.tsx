'use client'

// src/components/comments/comments-section.tsx
//
// The flat list of direct replies to whatever post is focused on this page -
// the main post, or, when you've tapped into a comment, that comment itself.
// Matches Threads: comments are never nested or indented here. To see a
// comment's own replies, you open its own page (comment-row.tsx does that on
// tap) - which renders through this exact same component, since every post
// and comment share the same page template.
//
// The reply composer itself is NOT rendered here - see post/[id]/page.tsx,
// which renders it as a fixed element pinned to the bottom of the screen, so
// it can never end up sitting in the middle of a short comment list. That
// composer calls addComment() (via the ref) when a new reply is posted.

import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import CommentRow, { type CommentData } from './comment-row'
import { applyLocalChanges, orderComments, type LocalChange, type ThreadPost } from '@/lib/comment-threads'

type Comment = CommentData & ThreadPost

export interface CommentsSectionHandle {
  addComment: (post: unknown) => void
}

interface Props {
  postAuthorId: string
  viewerId?: string
  initialComments: Comment[]
  sort: 'recent' | 'top'
  /** true when the server's initial fetch was cut short */
  hasMore?: boolean
}

const CommentsSection = forwardRef<CommentsSectionHandle, Props>(function CommentsSection(
  { postAuthorId, viewerId, initialComments, sort, hasMore },
  ref,
) {
  const [changes, setChanges] = useState<LocalChange<Comment>[]>([])
  const [freshId, setFreshId] = useState<string | null>(null)

  const comments = useMemo(
    () => orderComments(applyLocalChanges(initialComments, changes), viewerId, sort),
    [initialComments, changes, viewerId, sort],
  )

  useImperativeHandle(ref, () => ({
    addComment(post: unknown) {
      const comment = post as Comment
      if (!comment?.id) return
      setChanges(c => [...c, { kind: 'comment', post: comment }])
      setFreshId(comment.id)
      setTimeout(() => setFreshId(cur => (cur === comment.id ? null : cur)), 2500)
    },
  }), [])

  function handleDeleted(id: string) {
    setChanges(c => [...c, { kind: 'delete', id }])
  }

  if (comments.length === 0) {
    return (
      <div style={{ padding: '44px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-secondary)', margin: '0 0 4px' }}>No comments yet</p>
        <p style={{ fontSize: 14, color: 'var(--color-text-faint)', margin: 0 }}>Start the conversation.</p>
      </div>
    )
  }

  return (
    <div>
      {comments.map(comment => (
        <div key={comment.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
          <CommentRow
            post={comment}
            isPostAuthor={comment.author.id === postAuthorId}
            currentUserId={viewerId}
            isNew={freshId === comment.id}
            onDeleted={handleDeleted}
          />
        </div>
      ))}
      {hasMore && (
        <p style={{ padding: '18px 20px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-faint)' }}>
          Showing the latest comments.
        </p>
      )}
      <style>{`
        @keyframes commentIn {
          from { opacity: 0; transform: translateY(-6px); background: var(--color-brand-muted); }
          to   { opacity: 1; transform: none; background: transparent; }
        }
        .comment-new { animation: commentIn 0.6s ease-out; }
        .comment-media::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
})

export default CommentsSection
