'use client'

import { useState, useRef, useTransition } from 'react'
import { createPostAction } from '@/lib/actions'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

interface ReplyComposerProps {
  parentPostId: string
  viewerInitial: string
  viewerAvatar: string | null
}

export default function ReplyComposer({ parentPostId, viewerInitial, viewerAvatar }: ReplyComposerProps) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canPost = body.trim().length > 0 && body.length <= 500 && !isPending
  const charsLeft = 500 - body.length

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setBody(e.target.value)
    const ta = textareaRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px' }
  }

  function handleReply() {
    if (!canPost) return
    startTransition(async () => {
      await createPostAction({ body: body.trim(), parent_post_id: parentPostId })
      setBody('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      router.refresh()
    })
  }

  return (
    <div style={{
      position: 'sticky', bottom: 0, zIndex: 20,
      background: 'var(--nav-bg)', backdropFilter: 'blur(20px)',
      borderTop: '1px solid var(--color-border)',
      padding: '12px 16px',
      display: 'flex', gap: 12, alignItems: 'flex-end',
    }}>
      {/* Viewer avatar */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: viewerAvatar ? 'transparent' : 'var(--color-brand)',
        overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 13, color: 'white',
      }}>
        {viewerAvatar
          ? <img src={viewerAvatar} alt={viewerInitial} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : viewerInitial
        }
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleChange}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleReply() }}
          placeholder="Soro soke…"
          rows={1}
          style={{
            width: '100%', background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 22, resize: 'none',
            outline: 'none', fontSize: 15,
            color: 'var(--color-text-primary)',
            fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5,
            caretColor: 'var(--color-brand)',
            minHeight: 40, maxHeight: 140,
            padding: '10px 16px',
            boxSizing: 'border-box',
            WebkitAppearance: 'none',
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {body.length > 400 && (
          <span style={{ fontSize: 11, color: charsLeft < 0 ? 'var(--color-error)' : 'var(--color-text-muted)', fontWeight: 600 }}>
            {charsLeft}
          </span>
        )}
        <button
          onClick={handleReply}
          disabled={!canPost}
          style={{
            background: canPost ? 'var(--color-brand)' : 'var(--color-surface-3)',
            color: canPost ? 'white' : 'var(--color-text-muted)',
            border: 'none', borderRadius: 20, padding: '9px 20px',
            fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
            cursor: canPost ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s, color 0.15s',
            display: 'flex', alignItems: 'center', gap: 6,
            whiteSpace: 'nowrap',
          }}
        >
          {isPending && <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
          {isPending ? 'Replying…' : 'Reply'}
        </button>
      </div>
    </div>
  )
}