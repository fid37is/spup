'use client'

import { useState, useRef, useTransition, useCallback } from 'react'
import { ImageIcon, VideoIcon, X, Loader2 } from 'lucide-react'
import { createPostAction } from '@/lib/actions'

const MAX_CHARS = 500
const MAX_MEDIA = 4

interface MediaItem {
  tempId: string         // local temp key for React list
  cloudinary_id?: string // set after upload completes
  url: string            // Cloudinary URL (set after upload)
  media_type: 'image' | 'video'
  thumbnail_url?: string | null
  width?: number
  height?: number
  duration_secs?: number | null
  size_bytes?: number
  uploading?: boolean
  error?: string
  localPreview: string   // object URL for immediate preview
}

interface PostComposerProps {
  onPosted?: (post: unknown) => void
  authorName?: string
}

export default function PostComposer({ onPosted, authorName = 'P' }: PostComposerProps) {
  const [body, setBody] = useState('')
  const [media, setMedia] = useState<MediaItem[]>([])
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const charsLeft = MAX_CHARS - body.length
  const isOverLimit = charsLeft < 0
  const isWarning = charsLeft <= 30
  const hasUploading = media.some(m => m.uploading)
  const canPost = (body.trim().length > 0 || media.filter(m => !m.uploading && !m.error).length > 0)
    && !isOverLimit && !isPending && !hasUploading

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setBody(e.target.value)
    setError('')
    const ta = textareaRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px' }
  }

  const uploadFile = useCallback(async (file: File, type: 'image' | 'video') => {
    const localPreview = URL.createObjectURL(file)
    const tempId = `temp_${Date.now()}_${Math.random()}`

    // Add placeholder immediately so user sees preview while uploading
    setMedia(prev => [...prev, {
      tempId,
      url: localPreview,
      media_type: type,
      localPreview,
      uploading: true,
    }])

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('type', type)

      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await res.json()

      if (!res.ok || data.error) {
        setMedia(prev => prev.map(m =>
          m.tempId === tempId ? { ...m, uploading: false, error: data.error || 'Upload failed' } : m
        ))
        return
      }

      // Replace temp with real Cloudinary data
      setMedia(prev => prev.map(m =>
        m.tempId === tempId ? {
          tempId,
          cloudinary_id: data.media.cloudinary_id,
          url: data.media.url,
          media_type: data.media.media_type,
          thumbnail_url: data.media.thumbnail_url,
          width: data.media.width,
          height: data.media.height,
          duration_secs: data.media.duration_secs,
          size_bytes: data.media.size_bytes,
          localPreview,
          uploading: false,
        } : m
      ))
    } catch {
      setMedia(prev => prev.map(m =>
        m.tempId === tempId ? { ...m, uploading: false, error: 'Upload failed. Try again.' } : m
      ))
    }
  }, [])

  function handleFiles(files: FileList | null, type: 'image' | 'video') {
    if (!files || files.length === 0) return
    const validMedia = media.filter(m => !m.error)
    const slots = MAX_MEDIA - validMedia.length
    if (slots <= 0) return

    Array.from(files).slice(0, slots).forEach(file => uploadFile(file, type))
  }

  function removeMedia(tempId: string) {
    setMedia(prev => {
      const item = prev.find(m => m.tempId === tempId)
      if (item?.localPreview) URL.revokeObjectURL(item.localPreview)
      return prev.filter(m => m.tempId !== tempId)
    })
  }

  function handlePost() {
    if (!canPost) return
    const readyMedia = media.filter(m => !m.uploading && !m.error && m.cloudinary_id)
    startTransition(async () => {
      const result = await createPostAction({
        body: body.trim() || undefined,
        media: readyMedia.length > 0 ? readyMedia.map(m => ({
          url: m.url,
          thumbnail_url: m.thumbnail_url,
          media_type: m.media_type,
          width: m.width,
          height: m.height,
          duration_secs: m.duration_secs,
          size_bytes: m.size_bytes,
          cloudinary_id: m.cloudinary_id!,
        })) : undefined,
      })
      if ('error' in result && result.error) { setError(result.error); return }
      // Cleanup object URLs
      media.forEach(m => { if (m.localPreview) URL.revokeObjectURL(m.localPreview) })
      setBody('')
      setMedia([])
      setError('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      if (onPosted && 'postId' in result) onPosted({ id: result.postId })
    })
  }

  const activeMedia = media.filter(m => !m.error)
  const canAddMore = activeMedia.length < MAX_MEDIA
  const hasVideo = media.some(m => m.media_type === 'video')
  const hasImage = media.some(m => m.media_type === 'image')

  const radius = 10
  const circumference = 2 * Math.PI * radius
  const strokeOffset = circumference - Math.min(body.length / MAX_CHARS, 1) * circumference

  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex', gap: 12,
    }}>
      {/* Avatar */}
      <div style={{
        width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, var(--color-brand-dim), var(--color-brand))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15, color: 'white',
      }}>
        {authorName.slice(0, 2).toUpperCase()}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleTextChange}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handlePost() }}
          placeholder="Wetin dey happen? Share your take…"
          rows={2}
          style={{
            width: '100%', background: 'none', border: 'none', resize: 'none',
            outline: 'none', fontSize: 16,
            color: isOverLimit ? 'var(--color-error)' : 'var(--color-text-primary)',
            fontFamily: "'DM Sans', sans-serif", lineHeight: 1.55,
            caretColor: 'var(--color-brand)', minHeight: 52,
          }}
        />

        {/* Media previews */}
        {media.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: media.length === 1 ? '1fr' : 'repeat(2, 1fr)',
            gap: 4, borderRadius: 12, overflow: 'hidden',
            marginBottom: 10, maxHeight: 300,
          }}>
            {media.map(m => (
              <div key={m.tempId} style={{
                position: 'relative',
                aspectRatio: media.length === 1 ? '16/9' : '1/1',
                background: 'var(--color-surface-2)',
                overflow: 'hidden',
                gridColumn: media.length === 3 && media.indexOf(m) === 0 ? '1 / -1' : undefined,
              }}>
                {/* Preview */}
                {m.media_type === 'image' ? (
                  <img
                    src={m.localPreview || m.url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <video
                    src={m.localPreview || m.url}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    muted
                    playsInline
                  />
                )}

                {/* Uploading spinner overlay */}
                {m.uploading && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(0,0,0,0.55)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                    <Loader2 size={24} color="white" style={{ animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>Uploading…</span>
                  </div>
                )}

                {/* Error overlay */}
                {m.error && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(229,57,53,0.75)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 8,
                  }}>
                    <span style={{ fontSize: 12, color: 'white', textAlign: 'center' }}>{m.error}</span>
                  </div>
                )}

                {/* Remove button */}
                <button
                  onClick={() => removeMedia(m.tempId)}
                  style={{
                    position: 'absolute', top: 6, right: 6,
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.7)', border: 'none',
                    cursor: 'pointer', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div style={{ fontSize: 13, color: 'var(--color-error)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <X size={12} /> {error}
          </div>
        )}

        <div style={{ height: 1, background: 'var(--color-border)', margin: '8px 0' }} />

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {/* Image upload */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              style={{ display: 'none' }}
              onChange={e => { handleFiles(e.target.files, 'image'); e.target.value = '' }}
            />
            <ToolbarBtn
              icon={<ImageIcon size={18} />}
              label="Add image"
              disabled={!canAddMore || hasVideo}
              onClick={() => imageInputRef.current?.click()}
              title={hasVideo ? "Can't mix images and video" : canAddMore ? "Add image" : "Max 4 media"}
            />

            {/* Video upload */}
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/mov,video/avi"
              style={{ display: 'none' }}
              onChange={e => { handleFiles(e.target.files, 'video'); e.target.value = '' }}
            />
            <ToolbarBtn
              icon={<VideoIcon size={18} />}
              label="Add video"
              disabled={!canAddMore || hasImage || media.length > 0}
              onClick={() => videoInputRef.current?.click()}
              title={hasImage ? "Can't mix video and images" : media.length > 0 ? "Only 1 video allowed" : "Add video"}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Char counter */}
            {body.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width={26} height={26} style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx={13} cy={13} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={2.5} />
                  <circle cx={13} cy={13} r={radius} fill="none"
                    stroke={isOverLimit ? 'var(--color-error)' : isWarning ? 'var(--color-gold)' : 'var(--color-brand)'}
                    strokeWidth={2.5}
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeOffset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.1s, stroke 0.2s' }}
                  />
                </svg>
                {isWarning && (
                  <span style={{ fontSize: 12, color: isOverLimit ? 'var(--color-error)' : 'var(--color-gold)', fontWeight: 700 }}>
                    {charsLeft}
                  </span>
                )}
              </div>
            )}

            <div style={{ width: 1, height: 20, background: 'var(--color-border)' }} />

            {/* Post button */}
            <button
              onClick={handlePost}
              disabled={!canPost}
              style={{
                background: canPost ? 'var(--color-brand)' : 'var(--color-surface-2)',
                color: canPost ? 'white' : 'var(--color-text-muted)',
                border: 'none', borderRadius: 20, padding: '8px 20px',
                fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
                cursor: canPost ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s, color 0.15s',
                minHeight: 36,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {isPending && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />}
              {isPending ? 'Posting…' : hasUploading ? 'Uploading…' : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToolbarBtn({ icon, label, disabled, onClick, title }: {
  icon: React.ReactNode
  label: string
  disabled: boolean
  onClick: () => void
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={label}
      style={{
        width: 36, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? 'var(--color-text-faint)' : 'var(--color-brand)',
        borderRadius: 8,
        transition: 'background 0.12s',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--color-brand-muted)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
    >
      {icon}
    </button>
  )
}