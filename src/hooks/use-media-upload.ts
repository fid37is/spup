'use client'

import { useState, useCallback } from 'react'

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

export function useMediaUpload({ maxFiles = 4, type = 'post' }: UseMediaUploadOptions = {}) {
  const [media, setMedia] = useState<UploadedMedia[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  const upload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const remaining = maxFiles - media.length
    const toUpload = fileArray.slice(0, remaining)

    if (toUpload.length === 0) {
      setError(`Maximum ${maxFiles} files allowed`)
      return
    }

    setError('')
    setUploading(true)
    setProgress(0)

    const results: UploadedMedia[] = []

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

      const form = new FormData()
      form.append('file', file)
      form.append('type', type === 'post' ? (file.type.startsWith('video') ? 'video' : 'image') : type)

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: form })
        const data = await res.json()

        if (!res.ok || data.error) {
          setMedia(prev => prev.filter(m => m.id !== placeholder.id))
          setError(data.error || 'Upload failed')
          URL.revokeObjectURL(localPreview)
          continue
        }

        // API response has no `id` (DB insert happens later in createPostAction).
        // Use a stable client-side id so m.id is never undefined in MediaGrid.
        const uploaded: UploadedMedia = {
          ...data.media,
          id: `uploaded-${placeholder.id}`,
          localPreview,
        }
        results.push(uploaded)

        // Replace placeholder with real record
        setMedia(prev => prev.map(m => m.id === placeholder.id ? uploaded : m))
        setProgress(Math.round(((i + 1) / toUpload.length) * 100))

      } catch {
        setMedia(prev => prev.filter(m => m.id !== placeholder.id))
        setError('Upload failed. Check your connection.')
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