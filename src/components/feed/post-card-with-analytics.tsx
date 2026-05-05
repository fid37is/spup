// src/components/feed/post-card-with-analytics.tsx
'use client'

import { useState } from 'react'
import PostCard from './post-card'
import PostAnalyticsDrawer from './post-analytics-drawer'
import type { FeedPost } from '@/lib/actions/feed'

export default function PostCardWithAnalytics({
  post,
  currentUserId,
  onReplyClick,
}: {
  post: FeedPost
  currentUserId?: string
  onReplyClick?: () => void
}) {
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const isOwnPost = !!(currentUserId && post.author?.id === currentUserId)

  return (
    <>
      <PostCard
        post={post}
        currentUserId={currentUserId}
        onReplyClick={onReplyClick}
        onAnalyticsClick={() => setAnalyticsOpen(v => !v)}
        analyticsOpen={analyticsOpen}
      />
      {analyticsOpen && (
        <PostAnalyticsDrawer
          post={post}
          isOwnPost={isOwnPost}
          onClose={() => setAnalyticsOpen(false)}
        />
      )}
    </>
  )
}