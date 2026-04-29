'use client'

import { useState, useRef, useTransition, useCallback } from 'react'
import { ImageIcon, VideoIcon, X, Loader2, BarChart2, MapPin } from 'lucide-react'
import { createPostAction } from '@/lib/actions'
import { useRouter } from 'next/navigation'
import { useMediaUpload } from '@/hooks/use-media-upload'
import MediaGrid from '@/components/feed/media-grid'

const MAX_CHARS = 500

interface ReplyComposerProps {
  parentPostId: string
  viewerInitial: string
  viewerAvatar: string | null
  viewerName?: string
}

export default function ReplyComposer({
  parentPostId,
  viewerInitial,
  viewerAvatar,
  viewerName = 'Me',
}: ReplyComposerProps) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [focused, setFocused] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [showMedia, setShowMedia] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { media, uploading, progress, error: uploadError, upload, remove, clear } = useMediaUpload({ maxFiles: 4 })

  const charsLeft = MAX_CHARS - body.length
  const isOverLimit = charsLeft < 0
  const isWarning = charsLeft <= 30
  const hasContent = body.trim().length > 0 || media.length > 0
  const canPost = hasContent && !isOverLimit && !isPending && !uploading
  const isExpanded = focused || body.length > 0 || media.length > 0

  const radius = 10
  const circumference = 2 * Math.PI * radius
  const strokeOffset = circumference - Math.min(body.length / MAX_CHARS, 1) * circumference

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setBody(e.target.value)
    setError('')
    const ta = textareaRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px' }
  }

  function handleReply() {
    if (!canPost) return
    startTransition(async () => {
      const readyMedia = media.filter(m => m.cloudinary_id)
      const result = await createPostAction({
        body: body.trim() || undefined,
        parent_post_id: parentPostId,
        media: readyMedia.length > 0 ? readyMedia.map(m => ({
          url: m.url,
          thumbnail_url: m.thumbnail_url ?? undefined,
          media_type: m.media_type as 'image' | 'video',
          width: m.width ?? undefined,
          height: m.height ?? undefined,
          cloudinary_id: m.cloudinary_id!,
        })) : undefined,
      })
      if ('error' in result && result.error) { setError(result.error); return }
      setBody('')
      setError('')
      setShowMedia(false)
      setFocused(false)
      clear()
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      router.refresh()
    })
  }

  const handleUpload = useCallback((files: FileList | File[]) => {
    upload(files)
    setShowMedia(true)
  }, [upload])

  return (
    <div style={{
      position: 'sticky',
      bottom: 0,
      zIndex: 20,
      background: 'var(--nav-bg)',
      backdropFilter: 'blur(20px)',
      borderTop: '1px solid var(--color-border)',
    }}>
      <div style={{
        padding: isExpanded ? '12px 16px 8px' : '10px 16px',
        display: 'flex', gap: 12, alignItems: 'flex-start',
        position: 'relative',
      }}>
        {/* Avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: viewerAvatar ? 'transparent' : 'var(--color-brand)',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 13, color: 'white',
          marginTop: 2,
        }}>
          {viewerAvatar
            ? <img src={viewerAvatar} alt={viewerInitial} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : viewerInitial
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={body}
            onChange={handleChange}
            onFocus={() => setFocused(true)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleReply() }}
            placeholder="Soro soke…"
            rows={1}
            style={{
              width: '100%',
              background: 'none',
              border: 'none',
              resize: 'none',
              outline: 'none',
              fontSize: 15,
              color: isOverLimit ? 'var(--color-error)' : 'var(--color-text-primary)',
              fontFamily: "'DM Sans', sans-serif",
              lineHeight: 1.5,
              caretColor: 'var(--color-brand)',
              minHeight: 36,
              maxHeight: 160,
              boxSizing: 'border-box',
              padding: '8px 0',
              WebkitAppearance: 'none',
              display: 'block',
            }}
          />

          {/* Media grid */}
          {showMedia && (
            <div style={{ marginTop: 8 }}>
              <MediaGrid
                media={media}
                uploading={uploading}
                progress={progress}
                error={uploadError}
                onUpload={handleUpload}
                onRemove={remove}
              />
            </div>
          )}

          {error && (
            <p style={{ fontSize: 13, color: 'var(--color-error)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <X size={12} /> {error}
            </p>
          )}

          {/* Toolbar — only when expanded */}
          {isExpanded && (
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid var(--color-border)',
              paddingTop: 8, marginTop: 4,
            }}>
              <div style={{ display: 'flex', gap: 2 }}>
                <ToolbarBtn
                  icon={<ImageIcon size={17} />}
                  label="Add image"
                  onClick={() => {
                    setShowMedia(true)
                    ;(document.getElementById('reply-img-input') as HTMLInputElement | null)?.click()
                  }}
                />
                <ToolbarBtn
                  icon={<VideoIcon size={17} />}
                  label="Add video"
                  onClick={() => {
                    setShowMedia(true)
                    ;(document.getElementById('reply-vid-input') as HTMLInputElement | null)?.click()
                  }}
                />
                <ToolbarBtn icon={<BarChart2 size={17} />} label="Poll (coming soon)" onClick={() => {}} disabled />
                <ToolbarBtn icon={<MapPin size={17} />} label="Location (coming soon)" onClick={() => {}} disabled />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {body.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width={22} height={22} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
                      <circle cx={11} cy={11} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={2.5} />
                      <circle cx={11} cy={11} r={radius} fill="none"
                        stroke={isOverLimit ? 'var(--color-error)' : isWarning ? 'var(--color-gold)' : 'var(--color-brand)'}
                        strokeWidth={2.5}
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeOffset}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 0.1s, stroke 0.2s' }}
                      />
                    </svg>
                    {isWarning && (
                      <span style={{ fontSize: 11, color: isOverLimit ? 'var(--color-error)' : 'var(--color-gold)', fontWeight: 700 }}>
                        {charsLeft}
                      </span>
                    )}
                  </div>
                )}

                <button
                  onClick={handleReply}
                  disabled={!canPost}
                  style={{
                    background: canPost ? 'var(--color-brand)' : 'var(--color-surface-3)',
                    color: canPost ? 'white' : 'var(--color-text-muted)',
                    border: 'none', borderRadius: 20, padding: '7px 18px',
                    fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13,
                    cursor: canPost ? 'pointer' : 'not-allowed',
                    transition: 'background 0.15s, color 0.15s',
                    display: 'flex', alignItems: 'center', gap: 5,
                    whiteSpace: 'nowrap', minHeight: 34,
                  }}
                >
                  {isPending && <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} />}
                  {isPending ? 'Replying…' : 'Reply'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Collapsed: reply pill */}
        {!isExpanded && (
          <button
            onClick={() => { setFocused(true); textareaRef.current?.focus() }}
            style={{
              background: 'var(--color-surface-3)',
              color: 'var(--color-text-muted)',
              border: 'none', borderRadius: 20, padding: '7px 18px',
              fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13,
              cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              alignSelf: 'center',
            }}
          >
            Reply
          </button>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        id="reply-img-input"
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files) { handleUpload(e.target.files); e.target.value = '' } }}
      />
      <input
        id="reply-vid-input"
        type="file"
        accept="video/mp4,video/webm,video/mov,video/avi"
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files) { handleUpload(e.target.files); e.target.value = '' } }}
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
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
        width: 34, height: 34,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? 'var(--color-text-faint)' : 'var(--color-brand)',
        borderRadius: 8,
        transition: 'background 0.12s',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {icon}
    </button>
  )
}