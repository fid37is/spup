// src/app/(main)/post/[id]/reply-to-reply.tsx
'use client'

import { useState, useEffect } from 'react'
import PostCardWithAnalytics from '@/components/feed/post-card-with-analytics'
import PostModal from '@/components/feed/post-modal'
import { useRouter } from 'next/navigation'

interface ReplyToReplyProps {
  reply: any
  viewer: { display_name: string; avatar_url: string | null }
  currentUserId?: string
  /** The post detail page this thread lives on - after posting, the reply
      screen returns here, not to the replied-to comment's own page. */
  postId: string
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    setMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return mobile
}

export default function ReplyToReply({ reply, viewer, currentUserId, postId }: ReplyToReplyProps) {
  const [showModal, setShowModal] = useState(false)
  const isMobile = useIsMobile()
  const router = useRouter()

  function handleReplyClick() {
    if (isMobile) {
      // This used to push to `/post/${reply.id}` - the reply's OWN post
      // detail page, with its own header and its own sticky composer. That
      // took you off the thread you were reading into an unrelated page
      // that happened to reuse the same components, which read as the
      // composer "appearing in the middle of the comments." The fullscreen
      // reply screen (same one the root-post composer already uses) is the
      // right target: it shows the stacked thread leading up to this reply.
      // returnTo carries the post detail page you were actually on, so
      // after posting you land back here - not on the replied-to comment's
      // own separate page, which is a different, disorienting destination.
      router.push(`/compose?replyTo=${reply.id}&returnTo=${postId}`)
    } else {
      setShowModal(true)
    }
  }

  return (
    <>
      <PostCardWithAnalytics
        post={reply}
        currentUserId={currentUserId}
        onReplyClick={handleReplyClick}
      />
      {showModal && (
        <PostModal
          onClose={() => setShowModal(false)}
          parentPostId={reply.id}
          replyTo={{
            author: reply.author,
            body: reply.body,
          }}
          viewer={viewer}
        />
      )}
    </>
  )
}