// src/app/(main)/post/[id]/replies-panel.tsx
'use client'

// Owns the replies list as client state so a reply you post appears
// immediately - no page refresh, no waiting on a server round trip. Before
// this, ReplyComposer always fell back to router.refresh() because nothing
// ever passed it an onPosted callback; that re-fetches the whole page from
// the server, which works but isn't instant and isn't "real-time" the way
// the person actually typing a reply expects. createPostAction already
// returns the fully-hydrated post (author, media, counts) specifically so a
// caller can prepend it locally instead of waiting - this component is what
// actually uses that.

import { useState, useCallback } from 'react'
import ReplyComposer from './reply-composer'
import ReplyToReply from './reply-to-reply'
import NestedReplies from './nested-replies'

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

  return (
    <>
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
        replies.map((reply: any) => (
          <div key={reply.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
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
        ))
      )}
    </>
  )
}