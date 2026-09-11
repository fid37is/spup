// src/components/feed/post-card-with-analytics.tsx
'use client'

import PostCard from './post-card'
import type { FeedPost } from '@/lib/actions/feed'

// Previously toggled an inline analytics drawer via onAnalyticsClick/analyticsOpen
// on PostCard. That prop pair no longer exists on PostCard — analytics moved to
// a dedicated "Post activity" page (see post/[id]/activity/page.tsx), reached
// via a link on the post detail page, not an inline toggle. Kept as a thin
// passthrough (rather than replacing every call site) since this component is
// used in 5 places across the app.
export default function PostCardWithAnalytics({
  post,
  currentUserId,
  onReplyClick,
}: {
  post: FeedPost
  currentUserId?: string
  onReplyClick?: () => void
}) {
  return <PostCard post={post} currentUserId={currentUserId} onReplyClick={onReplyClick} />
}
