'use client'

import { useState, useCallback } from 'react'
import { MAX_MEDIA_PER_POST, MAX_POST_MEDIA_BYTES, POST_MEDIA_TOO_BIG, selectFilesForPost, totalMediaBytes, type MediaKind } from '@/lib/media-limits'
import { compressImageForUpload } from '@/lib/media-client'
import { uploadMedia } from '@/lib/upload-media'

export interface UploadedMedia {
  id: string
  url: string
  thumbnail_url: string | null
  media_type: 'image' | 'video' | 'audio' | 'gif'
  cloudinary_id: string
  width: number | null
  height: number | null
  localPreview?: string
  duration_secs: number | null
  size_bytes: number | null
}

interface UseMediaUploadOptions {
  maxFiles?: number
  type?: 'post' | 'avatar' | 'banner'
}

export function useMediaUpload({ maxFiles = MAX_MEDIA_PER_POST, type = 'post' }: UseMediaUploadOptions = {}) {
  const [media, setMedia] = useState<UploadedMedia[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  const upload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)

    // Post media is checked against the shared limits (type, per-file size,
    // 4 items max, 2 videos max, 25MB total) *before* anything is sent - no point
    // spending someone's slow data on an upload the server would reject.
    let toUpload: File[]
    let selectError: string | null = null
    if (type === 'post') {
      const existing: MediaKind[] = media.map(m => (m.media_type === 'video' ? 'video' : 'image'))
      const selected = selectFilesForPost(existing, fileArray)
      toUpload = selected.accepted
      selectError = selected.error
    } else {
      toUpload = fileArray.slice(0, Math.max(0, maxFiles - media.length))
    }

    if (toUpload.length === 0) {
      setError(selectError ?? `Maximum ${maxFiles} files allowed`)
      return
    }

    setError(selectError ?? '')
    setUploading(true)
    setProgress(0)

    const results: UploadedMedia[] = []
    // Bytes already in this post (photos + videos), plus what we add below.
    let mediaBytes = totalMediaBytes(media)

    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i]
      const localPreview = URL.createObjectURL(file)

      // Add optimistic placeholder
      const placeholder: UploadedMedia = {
        id: `uploading-${Date.now()}-${i}`,
        url: localPreview,
        thumbnail_url: null,
        media_type: file.type.startsWith('video') ? 'video' : 'image',
        cloudinary_id: '',
        width: null,
        height: null,
        duration_secs: null,
        size_bytes: null,
        localPreview,
      }
      setMedia(prev => [...prev, placeholder])

      // Phone photos are often 3-8MB; shrink before sending (photos only).
      const toSend = file.type.startsWith('image/') ? await compressImageForUpload(file) : file

      if (mediaBytes + toSend.size > MAX_POST_MEDIA_BYTES) {
        setMedia(prev => prev.filter(m => m.id !== placeholder.id))
        URL.revokeObjectURL(localPreview)
        setError(POST_MEDIA_TOO_BIG)
        continue
      }
      mediaBytes += toSend.size

      try {
        // Straight to Cloudinary from the phone (signed by /api/upload/signature),
        // with real progress and automatic retry if the connection drops.
        const kind = type === 'post' ? (file.type.startsWith('video') ? 'video' : 'image') : type
        const result = await uploadMedia(toSend, kind, pct => {
          setProgress(Math.round(((i + pct / 100) / toUpload.length) * 100))
        })

        // No DB row yet (that happens later in createPostAction).
        // Use a stable client-side id so m.id is never undefined in MediaGrid.
        const uploaded: UploadedMedia = {
          ...result,
          id: `uploaded-${placeholder.id}`,
          localPreview,
        }
        results.push(uploaded)

        // Replace placeholder with real record
        setMedia(prev => prev.map(m => m.id === placeholder.id ? uploaded : m))
        setProgress(Math.round(((i + 1) / toUpload.length) * 100))

      } catch (err) {
        setMedia(prev => prev.filter(m => m.id !== placeholder.id))
        setError(err instanceof Error && err.message ? err.message : 'Upload failed. Check your connection.')
        URL.revokeObjectURL(localPreview)
      }
    }

    setUploading(false)
    setProgress(0)
    return results
  }, [media.length, maxFiles, type])

  function remove(id: string) {
    setMedia(prev => {
      const item = prev.find(m => m.id === id)
      if (item?.localPreview) URL.revokeObjectURL(item.localPreview)
      return prev.filter(m => m.id !== id)
    })
  }

  function clear() {
    media.forEach(m => { if (m.localPreview) URL.revokeObjectURL(m.localPreview) })
    setMedia([])
    setError('')
  }

  return { media, uploading, progress, error, upload, remove, clear }
}