'use client'

import { useState, useRef, useTransition } from 'react'
import { X, Image, Video, BarChart2, MapPin } from 'lucide-react'
import { createPostAction } from '@/lib/actions'
import { useRouter } from 'next/navigation'
import { useMediaUpload } from '@/hooks/use-media-upload'
import MediaGrid from './media-grid'

const MAX_CHARS = 500

export default function PostModal({ onClose }: { onClose: () => void }) {
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
      const result = await createPostAction({
        body: body.trim() || undefined,
        media: media
          .filter(m => !m.id.startsWith('uploading-') && (m.media_type === 'image' || m.media_type === 'video'))
          .map(m => ({
            url: m.url,
            media_type: m.media_type as 'image' | 'video',
            cloudinary_id: m.cloudinary_id,
            thumbnail_url: m.thumbnail_url,
            width: m.width ?? undefined,
            height: m.height ?? undefined,
          })),
      })
      if ('error' in result && result.error) { setError(result.error); return }
      clear(); onClose(); router.refresh()
    })
  }

  const radius = 11, circumference = 2 * Math.PI * radius
  const strokeOffset = circumference - Math.min(body.length / MAX_CHARS, 1) * circumference

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 60,
      }}
    >
      <div style={{
        background: '#111', border: '1px solid #2A2A2A', borderRadius: 18,
        width: '100%', maxWidth: 560, margin: '0 16px',
        animation: 'modalIn 0.2s ease',
      }}>
        <style>{`@keyframes modalIn { from { opacity:0; transform:translateY(-12px); } to { opacity:1; transform:translateY(0); } }`}</style>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #1A1A1A' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9A9A90', display: 'flex', borderRadius: 8, padding: 4 }}>
            <X size={20} />
          </button>
          <button
            onClick={handlePost} disabled={!canPost}
            style={{
              background: canPost ? '#1A7A4A' : '#1A1A1A', color: canPost ? 'white' : '#333',
              border: 'none', borderRadius: 20, padding: '8px 20px',
              fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
              cursor: canPost ? 'pointer' : 'not-allowed', transition: 'background 0.15s, color 0.15s',
            }}
          >
            {isPending ? 'Posting…' : 'Post'}
          </button>
        </div>

        <div style={{ padding: '16px 16px 0', display: 'flex', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #1A7A4A, #22A861)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, color: 'white',
          }}>P</div>

          <div style={{ flex: 1 }}>
            <textarea
              ref={textareaRef} value={body} onChange={handleChange}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handlePost() }}
              placeholder="Wetin dey happen? Share your take…"
              autoFocus rows={3}
              style={{
                width: '100%', background: 'none', border: 'none', resize: 'none',
                outline: 'none', fontSize: 17, color: isOverLimit ? '#E53935' : '#F5F5F0',
                fontFamily: "'DM Sans', sans-serif", lineHeight: 1.55,
                caretColor: '#22A861', minHeight: 80, transition: 'color 0.15s',
              }}
            />
            {error && <p style={{ fontSize: 13, color: '#E53935', marginBottom: 8 }}>{error}</p>}
          </div>
        </div>

        {showMedia && (
          <div style={{ padding: '0 16px' }}>
            <MediaGrid
              media={media} uploading={uploading} progress={progress}
              error={uploadError} onUpload={upload} onRemove={remove}
            />
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px 16px', borderTop: '1px solid #141414', marginTop: 8,
        }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {[
              { icon: Image, label: 'Add image/video', action: () => setShowMedia(v => !v) },
              { icon: BarChart2, label: 'Create poll', action: () => { } },
              { icon: MapPin, label: 'Add location', action: () => { } },
            ].map(({ icon: Icon, label, action }) => (
              <button key={label} title={label} onClick={action} style={{
                width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', cursor: 'pointer', color: '#1A7A4A', borderRadius: 8,
              }}><Icon size={18} /></button>
            ))}
          </div>

          {body.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width={28} height={28} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={14} cy={14} r={radius} fill="none" stroke="#222" strokeWidth={2.5} />
                <circle cx={14} cy={14} r={radius} fill="none"
                  stroke={isOverLimit ? '#E53935' : isWarning ? '#D4A017' : '#22A861'}
                  strokeWidth={2.5} strokeDasharray={circumference} strokeDashoffset={strokeOffset}
                  strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.1s, stroke 0.2s' }} />
              </svg>
              {isWarning && <span style={{ fontSize: 13, color: isOverLimit ? '#E53935' : '#D4A017', fontWeight: 700, minWidth: 24 }}>{charsLeft}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
