// src/app/(main)/post/[id]/replies-panel.tsx
'use client'

import { useState, useCallback } from 'react'
import ReplyComposer from './reply-composer'
import ReplyToReply, { ReplyInsertContext } from './reply-to-reply'
import NestedReplies from './nested-replies'
import AdSlot from '@/components/feed/ad-card'


const REPLY_AD_POSITIONS = new Set([1, 3, 8])

interface RepliesPanelProps {
  postId: string
  initialReplies: any[]
  viewerName: string
  viewerInitial: string
  viewerAvatar: string | null
  viewerUserId?: string
}

export default function RepliesPanel({
  postId, initialReplies, viewerName, viewerInitial, viewerAvatar, viewerUserId,
}: RepliesPanelProps) {
  const [replies, setReplies] = useState(initialReplies)

  const handleNewReply = useCallback((post: any) => {
    // A reply to the root post: newest-first (matches the "Recent" sort
    // the page loads with) - prepend it, no nested children yet.
    setReplies(prev => [{ ...post, nested: [] }, ...prev])
  }, [])

  // A reply to a comment (root or nested) goes at the end of that comment's own replies.
  const insertReply = useCallback((parentId: string, post: any) => {
    const add = (nodes: any[]): any[] => nodes.map(n => {
      if (n.id === parentId) return { ...n, nested: [...(n.nested ?? []), { ...post, nested: [] }] }
      return n.nested?.length ? { ...n, nested: add(n.nested) } : n
    })
    setReplies(prev => add(prev))
  }, [])

  return (
    <ReplyInsertContext.Provider value={insertReply}>
      <ReplyComposer
        parentPostId={postId}
        viewerInitial={viewerInitial}
        viewerAvatar={viewerAvatar}
        viewerName={viewerName}
        onPosted={handleNewReply}
      />

      {/* Divider */}
      <div style={{ height: 8, background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)' }} />

      {replies.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-faint)' }}>No replies yet. Be the first!</p>
        </div>
      ) : (
        replies.map((reply: any, index: number) => (
          <div key={reply.id}>
            <div style={{ borderBottom: '1px solid var(--color-border)' }}>
              {/* Positioned + raised above the NestedReplies block below it:
                  that block's trunk line reaches UP into this row (a fixed
                  -40px estimate) to visually originate at this avatar, and
                  since the trunk is itself position:absolute, it paints above
                  a plain static sibling regardless of DOM order - which is
                  what let it draw over this avatar instead of behind it. */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <ReplyToReply
                  reply={reply}
                  viewer={{ display_name: viewerName, avatar_url: viewerAvatar }}
                  currentUserId={viewerUserId}
                  postId={postId}
                  hideBorder={!!(reply.nested && reply.nested.length > 0)}
                />
              </div>
              {reply.nested && reply.nested.length > 0 && (
                <NestedReplies
                  nested={reply.nested}
                  viewer={{ display_name: viewerName, avatar_url: viewerAvatar }}
                  currentUserId={viewerUserId}
                  postId={postId}
                />
              )}
            </div>
            {REPLY_AD_POSITIONS.has(index + 1) && (
              <AdSlot postId={postId} position={index} />
            )}
          </div>
        ))
      )}
    </ReplyInsertContext.Provider>
  )
}