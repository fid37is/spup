// src/lib/video-analytics.ts
//
// Single place that turns "the video is at time T" into view / completion
// counts, shared by the inline player (post-card) and the full-screen player
// (media-viewer). Both report here, so watching in one and then the other
// counts once, and someone who only ever watches full screen still counts.
//
//   view        >= 3 seconds of playback position reached
//   completion  >= 95% of the duration reached
//
// Each is fired at most once per (post, video) for the life of the page session.

import { recordVideoViewAction, recordVideoCompletionAction } from '@/lib/actions'

const VIEW_AT_SECONDS = 3
const COMPLETE_AT_RATIO = 0.95

const fired = new Set<string>()

export function trackVideoProgress(postId: string, src: string, currentTime: number, duration: number) {
  if (!postId || !Number.isFinite(currentTime)) return
  const key = `${postId}|${src}`

  if (currentTime >= VIEW_AT_SECONDS && !fired.has(`v|${key}`)) {
    fired.add(`v|${key}`)
    void recordVideoViewAction(postId)
  }
  if (duration > 0 && currentTime / duration >= COMPLETE_AT_RATIO && !fired.has(`c|${key}`)) {
    fired.add(`c|${key}`)
    void recordVideoCompletionAction(postId)
  }
}
