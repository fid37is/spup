'use client'

import { useState, useEffect } from 'react'
import PostCard from '@/components/feed/post-card'
import PostModal from '@/components/feed/post-modal'
import { useRouter } from 'next/navigation'

interface ReplyToReplyProps {
  reply: any
  viewer: { display_name: string; avatar_url: string | null }
  currentUserId?: string
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

export default function ReplyToReply({ reply, viewer, currentUserId }: ReplyToReplyProps) {
  const [showModal, setShowModal] = useState(false)
  const isMobile = useIsMobile()
  const router = useRouter()

  function handleReplyClick() {
    if (isMobile) {
      router.push(`/post/${reply.id}`)
    } else {
      setShowModal(true)
    }
  }

  return (
    <>
      <PostCard
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