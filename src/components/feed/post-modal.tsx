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
  parentPostId?: string       // set when replying
  replyTo?: {                  // post being replied to (shown as preview)
    author: { display_name: string; username: string; avatar_url?: string | null }
    body: string | null
  }
  viewer?: {
    display_name: string
    avatar_url?: string | null
  }
}

export default function PostModal({ onClose, parentPostId, replyTo, viewer }: PostModalProps) {
  const router = useRouter()
  const [body, setBody] = useState('')
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
        media: readyMedia.length > 0
          ? readyMedia.map((m) => ({
            url: m.url,
            thumbnail_url: m.thumbnail_url,
            media_type: m.media_type as 'image' | 'video',
            // ← Convert null → undefined (this fixes the big type error)
            width: m.width ?? undefined,
            height: m.height ?? undefined,
            duration_secs: m.duration_secs ?? undefined,
            size_bytes: m.size_bytes ?? undefined,
            cloudinary_id: m.cloudinary_id!,
          }))
          : undefined,
      })

      if ('error' in result && result.error) {
        setError(result.error)
        return
      }

      clear()
      onClose()
      router.refresh()
    })
  }

  const radius = 11, circumference = 2 * Math.PI * radius
  const strokeOffset = circumference - Math.min(body.length / MAX_CHARS, 1) * circumference

  // Avatar helper
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
        {url ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : name.slice(0, 2).toUpperCase()}
      </div>
    )
  }

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'var(--overlay-bg)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 60,
      }}
    >
      <div style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: 18,
        width: '100%', maxWidth: 560, margin: '0 16px',
        animation: 'modalIn 0.2s ease',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', borderRadius: 8, padding: 4 }}>
            <X size={20} />
          </button>
          <button onClick={handlePost} disabled={!canPost} style={{
            background: canPost ? 'var(--color-brand)' : 'var(--color-surface-2)',
            color: canPost ? 'white' : 'var(--color-text-muted)',
            border: 'none', borderRadius: 20, padding: '8px 20px',
            fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14,
            cursor: canPost ? 'pointer' : 'not-allowed', transition: 'background 0.15s, color 0.15s',
          }}>
            {isPending ? (parentPostId ? 'Replying…' : 'Posting…') : (parentPostId ? 'Reply' : 'Post')}
          </button>
        </div>

        {/* Reply-to preview */}
        {replyTo && (
          <div style={{ padding: '12px 16px 0 16px', display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <AvatarCircle name={replyTo.author.display_name} url={replyTo.author.avatar_url} size={36} />
              <div style={{ width: 2, flex: 1, minHeight: 20, background: 'var(--color-border)', margin: '4px 0' }} />
            </div>
            <div style={{ flex: 1, paddingBottom: 8 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text-primary)', fontFamily: "'Syne',sans-serif" }}>{replyTo.author.display_name}</span>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>@{replyTo.author.username}</span>
              </div>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{replyTo.body}</p>
              <p style={{ fontSize: 13, color: 'var(--color-text-faint)', marginTop: 6 }}>
                Replying to <span style={{ color: 'var(--color-brand)' }}>@{replyTo.author.username}</span>
              </p>
            </div>
          </div>
        )}

        {/* Compose area */}
        <div style={{ padding: '16px 16px 0', display: 'flex', gap: 12 }}>
          <AvatarCircle name={viewer?.display_name || 'Me'} url={viewer?.avatar_url} size={44} />
          <div style={{ flex: 1 }}>
            <textarea
              ref={textareaRef} value={body} onChange={handleChange}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handlePost() }}
              placeholder={parentPostId ? 'Soro soke…' : 'Wetin dey happen? Share your take…'}
              autoFocus rows={3}
              style={{
                width: '100%', background: 'none', border: 'none', resize: 'none',
                outline: 'none', fontSize: 17,
                color: isOverLimit ? 'var(--color-error)' : 'var(--color-text-primary)',
                fontFamily: "'DM Sans',sans-serif", lineHeight: 1.55,
                caretColor: 'var(--color-brand)', minHeight: 80, transition: 'color 0.15s',
              }}
            />
            {error && <p style={{ fontSize: 13, color: 'var(--color-error)', marginBottom: 8 }}>{error}</p>}
          </div>
        </div>

        {showMedia && (
          <div style={{ padding: '0 16px' }}>
            <MediaGrid media={media} uploading={uploading} progress={progress} error={uploadError} onUpload={upload} onRemove={remove} />
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 16px', borderTop: '1px solid var(--color-border)', marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {[
              { icon: ImageIcon, label: 'Add media', action: () => setShowMedia(v => !v) },
              { icon: BarChart2, label: 'Create poll', action: () => { } },
              { icon: MapPin, label: 'Add location', action: () => { } },
            ].map(({ icon: Icon, label, action }) => (
              <button key={label} title={label} onClick={action} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-brand)', borderRadius: 8 }}>
                <Icon size={18} />
              </button>
            ))}
          </div>

          {body.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width={28} height={28} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={14} cy={14} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={2.5} />
                <circle cx={14} cy={14} r={radius} fill="none"
                  stroke={isOverLimit ? 'var(--color-error)' : isWarning ? 'var(--color-gold)' : 'var(--color-brand)'}
                  strokeWidth={2.5} strokeDasharray={circumference} strokeDashoffset={strokeOffset}
                  strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.1s, stroke 0.2s' }} />
              </svg>
              {isWarning && <span style={{ fontSize: 13, color: isOverLimit ? 'var(--color-error)' : 'var(--color-gold)', fontWeight: 700, minWidth: 24 }}>{charsLeft}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}