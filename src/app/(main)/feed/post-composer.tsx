'use client'

import { useState, useRef, useTransition } from 'react'
import { Image, Video, BarChart2, MapPin, X } from 'lucide-react'
import { createPostAction } from '@/lib/actions'

const MAX_CHARS = 500

interface PostComposerProps {
  onPosted?: (post: unknown) => void
}

export default function PostComposer({ onPosted }: PostComposerProps) {
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const charsLeft = MAX_CHARS - body.length
  const isOverLimit = charsLeft < 0
  const isWarning = charsLeft <= 30
  const canPost = body.trim().length > 0 && !isOverLimit && !isPending

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setBody(e.target.value); setError('')
    const ta = textareaRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px' }
  }

  function handlePost() {
    if (!canPost) return
    startTransition(async () => {
      const result = await createPostAction({ body: body.trim() })
      if ('error' in result && result.error) { setError(result.error); return }
      setBody('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      if (onPosted && 'postId' in result) onPosted({ id: result.postId })
    })
  }

  const radius = 10, circumference = 2 * Math.PI * radius
  const strokeOffset = circumference - Math.min(body.length / MAX_CHARS, 1) * circumference

  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid #1A1A1A', display: 'flex', gap: 12 }}>
      <div style={{
        width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, #1A7A4A, #22A861)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15, color: 'white',
      }}>P</div>

      <div style={{ flex: 1 }}>
        <textarea
          ref={textareaRef} value={body} onChange={handleChange}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handlePost() }}
          placeholder="Wetin dey happen? Share your take…"
          rows={2}
          style={{
            width: '100%', background: 'none', border: 'none', resize: 'none',
            outline: 'none', fontSize: 16, color: isOverLimit ? '#E53935' : '#F5F5F0',
            fontFamily: "'DM Sans', sans-serif", lineHeight: 1.55,
            caretColor: '#22A861', minHeight: 52, transition: 'color 0.15s',
          }}
        />

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#E53935', marginBottom: 8 }}>
            <X size={12} /> {error}
          </div>
        )}

        <div style={{ height: 1, background: '#1A1A1A', margin: '8px 0' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {[{ icon: Image, label: 'Add image' }, { icon: Video, label: 'Add video' }, { icon: BarChart2, label: 'Poll' }, { icon: MapPin, label: 'Location' }].map(({ icon: Icon, label }) => (
              <button key={label} title={label} style={{
                width: 32, height: 32, display: 'flex', alignItems: 'center',
                justifyContent: 'center', background: 'none', border: 'none',
                cursor: 'pointer', color: '#1A7A4A', borderRadius: 6,
              }}><Icon size={17} /></button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {body.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width={26} height={26} style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx={13} cy={13} r={radius} fill="none" stroke="#222" strokeWidth={2.5} />
                  <circle cx={13} cy={13} r={radius} fill="none"
                    stroke={isOverLimit ? '#E53935' : isWarning ? '#D4A017' : '#22A861'}
                    strokeWidth={2.5} strokeDasharray={circumference} strokeDashoffset={strokeOffset}
                    strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.1s, stroke 0.2s' }} />
                </svg>
                {isWarning && <span style={{ fontSize: 12, color: isOverLimit ? '#E53935' : '#D4A017', fontWeight: 700 }}>{charsLeft}</span>}
              </div>
            )}
            <div style={{ width: 1, height: 20, background: '#1A1A1A' }} />
            <button onClick={handlePost} disabled={!canPost} style={{
              background: canPost ? '#1A7A4A' : '#111', color: canPost ? 'white' : '#333',
              border: 'none', borderRadius: 20, padding: '7px 18px',
              fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
              cursor: canPost ? 'pointer' : 'not-allowed', transition: 'background 0.15s, color 0.15s',
            }}>
              {isPending ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
