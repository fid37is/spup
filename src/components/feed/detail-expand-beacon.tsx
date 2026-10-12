'use client'

// src/components/feed/detail-expand-beacon.tsx
//
// Counts a "post expand": someone opened this post's own page. Rendered once by the post
// page, so every way of getting there is counted (tapping the post in the feed, from a
// notification, a profile, a shared link) - previously only the "Read more" tap counted,
// which is a tiny fraction of real opens.
//
// The author opening their own post is skipped, both here and again on the server.

import { useEffect } from 'react'
import { recordDetailExpandAction } from '@/lib/actions'

// Module-level, so a re-render (or React StrictMode's double effect) can't count one visit twice.
const counted = new Set<string>()

export default function DetailExpandBeacon({ postId, isOwnPost }: { postId: string; isOwnPost: boolean }) {
  useEffect(() => {
    if (isOwnPost || counted.has(postId)) return
    counted.add(postId)
    void recordDetailExpandAction(postId)
  }, [postId, isOwnPost])
  return null
}
