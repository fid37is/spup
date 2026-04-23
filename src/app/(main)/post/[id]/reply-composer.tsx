'use client'

import { useState, useRef, useTransition } from 'react'
import { createPostAction } from '@/lib/actions'
import { useRouter } from 'next/navigation'

export default function ReplyComposer({ parentPostId }: { parentPostId: string }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canPost = body.trim().length > 0 && body.length <= 500 && !isPending

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
      display: 'flex', gap: 12, padding: '14px 20px',
      borderBottom: '1px solid #1A1A1A', borderTop: '1px solid #1A1A1A',
      background: '#0D0D0D',
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
        background: '#1A7A4A', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontFamily: "'Syne', sans-serif",
        fontWeight: 800, fontSize: 14, color: 'white',
      }}>P</div>
      <div style={{ flex: 1 }}>
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleChange}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleReply() }}
          placeholder="Soro soke…"
          rows={2}
          style={{
            width: '100%', background: 'none', border: 'none', resize: 'none',
            outline: 'none', fontSize: 15, color: '#F5F5F0',
            fontFamily: "'DM Sans', sans-serif", lineHeight: 1.55,
            caretColor: '#22A861', minHeight: 48,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            onClick={handleReply}
            disabled={!canPost}
            style={{
              background: canPost ? '#1A7A4A' : '#1A1A1A',
              color: canPost ? 'white' : '#333',
              border: 'none', borderRadius: 20, padding: '7px 18px',
              fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
              cursor: canPost ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {isPending ? 'Replying…' : 'Reply'}
          </button>
        </div>
      </div>
    </div>
  )
}
