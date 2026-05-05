'use client'

import { useState, useRef, useTransition } from 'react'
import { X, ImageIcon, VideoIcon, BarChart2, MapPin } from 'lucide-react'
import { createPostAction } from '@/lib/actions'
import { useRouter } from 'next/navigation'
import { useMediaUpload } from '@/hooks/use-media-upload'
import MediaGrid from './media-grid'

const MAX_CHARS = 500

interface PostModalProps {
  onClose: () => void
  parentPostId?: string
  replyTo?: {
    author: { display_name: string; username: string; avatar_url?: string | null }
    body: string | null
  }
  viewer?: {
    display_name: string
    avatar_url?: string | null
  }
}

const AvatarCircle = ({ name, url, size = 44 }: { name: string; url?: string | null; size?: number }) => {
  const colors = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A1A4A', '#4A7A1A']
  const bg = colors[name.charCodeAt(0) % colors.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: url ? 'transparent' : bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Syne',sans-serif", fontWeight: 800,
      fontSize: size * 0.36, color: 'white',
    }}>
      {url
        ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : name.slice(0, 2).toUpperCase()
      }
    </div>
  )
}

export default function PostModal({ onClose, parentPostId, replyTo, viewer }: PostModalProps) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [showMedia, setShowMedia] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const { media, uploading, progress, error: uploadError, upload, remove, clear } = useMediaUpload({ maxFiles: 4 })

  const charsLeft = MAX_CHARS - body.length
  const isOverLimit = charsLeft < 0
  const isWarning = charsLeft <= 30
  const hasContent = body.trim().length > 0 || media.length > 0
  const canPost = hasContent && !isOverLimit && !isPending && !uploading

  const radius = 11
  const circumference = 2 * Math.PI * radius
  const strokeOffset = circumference - Math.min(body.length / MAX_CHARS, 1) * circumference

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setBody(e.target.value); setError('')
    const ta = textareaRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px' }
  }

  function handlePost() {
    if (!canPost) return
    startTransition(async () => {
      const readyMedia = media.filter(m => m.cloudinary_id)
      const result = await createPostAction({
        body: body.trim() || undefined,
        parent_post_id: parentPostId,
        media: readyMedia.length > 0 ? readyMedia.map(m => ({
          url: m.url,
          thumbnail_url: m.thumbnail_url || undefined,
          media_type: m.media_type as 'image' | 'video',
          width: m.width || undefined,
          height: m.height || undefined,
          duration_secs: m.duration_secs || undefined,
          size_bytes: m.size_bytes || undefined,
          cloudinary_id: m.cloudinary_id!,
        })) : undefined,
      })
      if ('error' in result && result.error) { setError(result.error); return }
      clear(); onClose(); router.refresh()
    })
  }

  const viewerName = viewer?.display_name || 'Me'

  return (
    <>
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(-12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={e => e.target === e.currentTarget && onClose()}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'var(--overlay-bg)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: 64,
        }}
      >
        <div style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: 18,
          width: '100%', maxWidth: 600, margin: '0 16px',
          animation: 'modalIn 0.2s ease',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(100vh - 80px)',
        }}>

          {/* Header: X close only — Post button lives in the toolbar */}
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border)',
            flexShrink: 0,
          }}>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: '50%',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <X size={18} />
            </button>
          </div>

          {/* Body — scrollable */}
          <div style={{ padding: '16px 16px 0', overflowY: 'auto', flex: 1 }}>

            {/* Reply-to preview with thread line */}
            {replyTo && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
                {/* Avatar + thread line */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <AvatarCircle name={replyTo.author.display_name} url={replyTo.author.avatar_url} size={38} />
                  <div style={{
                    width: 2, flex: 1, minHeight: 24,
                    background: 'var(--color-border)',
                    margin: '6px 0',
                    borderRadius: 1,
                  }} />
                </div>
                {/* Original post content */}
                <div style={{ flex: 1, paddingBottom: 8, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                    <span style={{
                      fontWeight: 700, fontSize: 14,
                      color: 'var(--color-text-primary)',
                      fontFamily: "'Syne',sans-serif",
                    }}>
                      {replyTo.author.display_name}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                      @{replyTo.author.username}
                    </span>
                  </div>
                  <p style={{
                    fontSize: 14, color: 'var(--color-text-secondary)',
                    lineHeight: 1.5, margin: 0,
                    overflow: 'hidden', display: '-webkit-box',
                    WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                  }}>
                    {replyTo.body}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--color-text-faint)', marginTop: 6 }}>
                    Replying to{' '}
                    <span style={{ color: 'var(--color-brand)' }}>@{replyTo.author.username}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Composer row */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flexShrink: 0 }}>
                <AvatarCircle name={viewerName} url={viewer?.avatar_url} size={38} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <textarea
                  ref={textareaRef}
                  value={body}
                  onChange={handleChange}
                  onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handlePost() }}
                  placeholder={parentPostId ? 'Post your reply' : 'Wetin dey happen? Share your take…'}
                  autoFocus
                  rows={3}
                  style={{
                    width: '100%', background: 'none', border: 'none', resize: 'none',
                    outline: 'none', fontSize: 17,
                    color: isOverLimit ? 'var(--color-error)' : 'var(--color-text-primary)',
                    fontFamily: "'DM Sans',sans-serif", lineHeight: 1.55,
                    caretColor: 'var(--color-brand)',
                    minHeight: 88, transition: 'color 0.15s',
                    padding: 0,
                  }}
                />
                {error && (
                  <p style={{ fontSize: 13, color: 'var(--color-error)', marginBottom: 8 }}>{error}</p>
                )}
              </div>
            </div>

            {/* Media grid */}
            {showMedia && (
              <div style={{ marginTop: 8 }}>
                <MediaGrid
                  media={media} uploading={uploading} progress={progress}
                  error={uploadError} onUpload={upload} onRemove={remove}
                />
              </div>
            )}
          </div>

          {/* Toolbar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px 14px',
            borderTop: '1px solid var(--color-border)',
            marginTop: 12,
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', gap: 2 }}>
              {/* Image */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files) { upload(e.target.files); setShowMedia(true); e.target.value = '' } }}
              />
              <ToolbarBtn
                icon={<ImageIcon size={18} />}
                label="Add image"
                onClick={() => imageInputRef.current?.click()}
              />

              {/* Video */}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm,video/mov,video/avi"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files) { upload(e.target.files); setShowMedia(true); e.target.value = '' } }}
              />
              <ToolbarBtn
                icon={<VideoIcon size={18} />}
                label="Add video"
                onClick={() => videoInputRef.current?.click()}
              />

              <ToolbarBtn icon={<BarChart2 size={18} />} label="Poll (coming soon)" onClick={() => {}} disabled />
              <ToolbarBtn icon={<MapPin size={18} />} label="Location (coming soon)" onClick={() => {}} disabled />
            </div>

            {/* Char counter + Post button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {body.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width={28} height={28} style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx={14} cy={14} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={2.5} />
                    <circle cx={14} cy={14} r={radius} fill="none"
                      stroke={isOverLimit ? 'var(--color-error)' : isWarning ? 'var(--color-gold)' : 'var(--color-brand)'}
                      strokeWidth={2.5} strokeDasharray={circumference} strokeDashoffset={strokeOffset}
                      strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.1s, stroke 0.2s' }}
                    />
                  </svg>
                  {isWarning && (
                    <span style={{
                      fontSize: 13, fontWeight: 700, minWidth: 24,
                      color: isOverLimit ? 'var(--color-error)' : 'var(--color-gold)',
                    }}>
                      {charsLeft}
                    </span>
                  )}
                </div>
              )}

              <button
                onClick={handlePost}
                disabled={!canPost}
                style={{
                  background: canPost ? 'var(--color-brand)' : 'var(--color-surface-3)',
                  color: canPost ? 'white' : 'var(--color-text-muted)',
                  border: 'none', borderRadius: 20, padding: '8px 22px',
                  fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14,
                  cursor: canPost ? 'pointer' : 'not-allowed',
                  transition: 'background 0.15s, color 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {isPending
                  ? (parentPostId ? 'Replying…' : 'Posting…')
                  : (parentPostId ? 'Reply' : 'Post')
                }
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}

function ToolbarBtn({ icon, label, onClick, disabled = false }: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        width: 36, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? 'var(--color-text-faint)' : 'var(--color-brand)',
        borderRadius: 8, transition: 'background 0.12s',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--color-brand-muted)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
    >
      {icon}
    </button>
  )
}