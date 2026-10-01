'use client'

// Like use-media-upload, but nothing here ever blocks posting: every picked
// file starts uploading immediately on its own (several at once, a few at a
// time), and `takeForPost()` hands the still-running uploads to the background
// poster instead of waiting for them. Items have the same shape MediaGrid
// already renders (an `uploading-` id while in flight).

import { useCallback, useEffect, useRef, useState } from 'react'
import { selectFilesForPost, MAX_POST_MEDIA_BYTES, POST_MEDIA_TOO_BIG, mediaKindOf, type MediaKind } from '@/lib/media-limits'
import { startMediaUpload, type UploadHandle } from '@/lib/posting/media-upload'
import type { PostJobMedia } from '@/lib/posting/poster'
import type { UploadedMedia } from '@/hooks/use-media-upload'

export function useBackgroundMedia() {
  const [media, setMedia] = useState<UploadedMedia[]>([])
  const [error, setError] = useState('')
  const handles = useRef(new Map<string, UploadHandle>())
  const files = useRef(new Map<string, File>())
  const mediaRef = useRef<UploadedMedia[]>([])
  mediaRef.current = media

  const upload = useCallback((picked: FileList | File[]) => {
    const existing: MediaKind[] = mediaRef.current.map(m => (m.media_type === 'video' ? 'video' : 'image'))
    const { accepted, error: selectError } = selectFilesForPost(existing, Array.from(picked))
    setError(selectError ?? '')

    for (const file of accepted) {
      const kind = mediaKindOf(file) ?? 'image'
      const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const localPreview = URL.createObjectURL(file)
      files.current.set(key, file)
      setMedia(prev => [...prev, {
        id: `uploading-${key}`, url: localPreview, thumbnail_url: null, media_type: kind,
        cloudinary_id: '', width: null, height: null, duration_secs: null, size_bytes: null, localPreview,
      }])

      const handle = startMediaUpload(file, kind, {
        beforeSend: bytes => {
          let others = 0
          handles.current.forEach((h, k) => { if (k !== key && h.sized && h.status !== 'error') others += h.sentBytes })
          return others + bytes > MAX_POST_MEDIA_BYTES ? POST_MEDIA_TOO_BIG : null
        },
      })
      handles.current.set(key, handle)
      handle.subscribe(() => {
        if (handles.current.get(key) !== handle) return
        if (handle.status === 'done' && handle.result) {
          setMedia(prev => prev.map(m => m.id === `uploading-${key}` ? { ...handle.result!, id: `uploaded-${key}`, localPreview } : m))
        } else if (handle.status === 'error') {
          // Drop the failed item (nothing to retry in this small bar) and say why.
          setMedia(prev => prev.filter(m => m.id !== `uploading-${key}`))
          URL.revokeObjectURL(localPreview)
          handles.current.delete(key)
          files.current.delete(key)
          setError(handle.error || 'Upload failed. Check your connection.')
        }
      })
    }
  }, [])

  const remove = useCallback((id: string) => {
    const key = id.replace(/^(uploading|uploaded)-/, '')
    const handle = handles.current.get(key)
    handles.current.delete(key)
    files.current.delete(key)
    handle?.cancel()
    setMedia(prev => {
      const item = prev.find(m => m.id === id)
      if (item?.localPreview) URL.revokeObjectURL(item.localPreview)
      return prev.filter(m => m.id !== id)
    })
  }, [])

  /** Gives the post everything attached - finished or still uploading - and lets go of it (so unmounting won't cancel it). */
  function takeForPost(): PostJobMedia[] {
    const items = mediaRef.current.map(m => {
      const key = m.id.replace(/^(uploading|uploaded)-/, '')
      const kind: 'image' | 'video' = m.media_type === 'video' ? 'video' : 'image'
      const done = m.cloudinary_id
        ? { url: m.url, thumbnail_url: m.thumbnail_url, media_type: kind, width: m.width, height: m.height,
            duration_secs: m.duration_secs, size_bytes: m.size_bytes ?? 0, cloudinary_id: m.cloudinary_id }
        : undefined
      return { key, kind, file: files.current.get(key), handle: handles.current.get(key), result: done }
    })
    mediaRef.current.forEach(m => { if (m.localPreview) URL.revokeObjectURL(m.localPreview) })
    handles.current.clear()
    files.current.clear()
    setMedia([])
    setError('')
    return items
  }

  // Closed without posting: stop uploads that are still running.
  useEffect(() => () => {
    handles.current.forEach(h => h.cancel())
    mediaRef.current.forEach(m => { if (m.localPreview) URL.revokeObjectURL(m.localPreview) })
  }, [])

  const uploading = media.some(m => m.id.startsWith('uploading-'))
  return { media, uploading, error, upload, remove, takeForPost }
}
