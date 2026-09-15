'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { getPendingPosts, syncAllPendingPosts, type PendingPost } from '@/lib/offline-post-queue'

/**
 * Syncs queued offline posts whenever the app comes back online or is
 * (re)opened. This is the fallback path for browsers without Background
 * Sync — most importantly iOS Safari, which doesn't support it at all, so
 * for those users "posts push automatically" only really happens while
 * the app is actually open. Android/Chrome get the real background sync
 * (registered in offline-post-queue.ts) on top of this.
 */
export function useOfflinePostSync() {
  const [pendingCount, setPendingCount] = useState(0)
  const syncingRef = useRef(false)

  const refreshCount = useCallback(() => {
    getPendingPosts().then(posts => setPendingCount(posts.length)).catch(() => {})
  }, [])

  const trySync = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return
    syncingRef.current = true
    try {
      await syncAllPendingPosts()
    } finally {
      syncingRef.current = false
      refreshCount()
    }
  }, [refreshCount])

  useEffect(() => {
    refreshCount()
    void trySync()

    function handleOnline() { void trySync() }
    function handleVisible() { if (document.visibilityState === 'visible') void trySync() }

    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisible)
    return () => {
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisible)
    }
  }, [trySync, refreshCount])

  return { pendingCount, refreshCount, trySync }
}

export type { PendingPost }
