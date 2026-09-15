'use client'

const DB_NAME = 'spup-offline'
const DB_VERSION = 1
const STORE = 'pending_posts'

export interface PendingPost {
  id: string
  body: string | null
  isSelling: boolean
  media: { blob: Blob; mediaType: 'image' | 'video'; name: string }[]
  createdAt: number
  status: 'pending' | 'syncing' | 'failed'
  error?: string
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function queueOfflinePost(input: {
  body: string | null
  isSelling: boolean
  media: { blob: Blob; mediaType: 'image' | 'video'; name: string }[]
}): Promise<PendingPost> {
  const db = await openDB()
  const post: PendingPost = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    body: input.body,
    isSelling: input.isSelling,
    media: input.media,
    createdAt: Date.now(),
    status: 'pending',
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(post)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
  return post
}

export async function getPendingPosts(): Promise<PendingPost[]> {
  const db = await openDB()
  const result = await new Promise<PendingPost[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve((req.result || []) as PendingPost[])
    req.onerror = () => reject(req.error)
  })
  db.close()
  return result.sort((a, b) => a.createdAt - b.createdAt)
}

export async function removePendingPost(id: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function markPendingPostFailed(id: string, error: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const record = getReq.result
      if (record) {
        record.status = 'failed'
        record.error = error
        store.put(record)
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

/**
 * Uploads and creates one queued post via /api/posts/sync. Used by both
 * the foreground fallback (see use-offline-post-sync.ts) and, indirectly,
 * mirrors what the service worker's retryFailedPosts does for real
 * background sync on browsers that support it.
 */
export async function syncPendingPost(post: PendingPost): Promise<{ ok: true } | { ok: false; error: string }> {
  const form = new FormData()
  if (post.body) form.append('body', post.body)
  form.append('isSelling', String(post.isSelling))
  for (const m of post.media) form.append('media', m.blob, m.name)

  try {
    const res = await fetch('/api/posts/sync', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.error) return { ok: false, error: data?.error || `Sync failed (${res.status})` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error during sync' }
  }
}

/** Attempts to sync every queued post, removing each on success. */
export async function syncAllPendingPosts(): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingPosts()
  let synced = 0, failed = 0
  for (const post of pending) {
    const result = await syncPendingPost(post)
    if (result.ok) {
      await removePendingPost(post.id)
      synced++
    } else {
      await markPendingPostFailed(post.id, result.error)
      failed++
    }
  }
  return { synced, failed }
}

export function registerBackgroundSync(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.ready
    .then(reg => {
      // Background Sync API doesn't exist on iOS Safari at all — this is
      // best-effort here. use-offline-post-sync.ts's foreground fallback
      // (triggered on the 'online' event and on load) is what actually
      // covers those browsers.
      const syncManager = (reg as unknown as { sync?: { register: (tag: string) => Promise<void> } }).sync
      syncManager?.register('retry-posts').catch(() => {})
    })
    .catch(() => {})
}
