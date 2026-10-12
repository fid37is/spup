'use client'

// src/components/chat/chat-media-viewer.tsx
//
// Full-screen viewer for a photo/video inside a chat. Built on the same portal as
// the post viewer (components/media/media-portal): black screen, close top-left,
// "..." top-right (Share via... / Save image), and a "Reply" field under the media.
//
// Replying here sends a normal chat message that quotes this photo/video, exactly
// like tapping the bubble and choosing Reply - the viewer just saves the detour.
// The photo is the very same URL the chat bubble already loaded, so it appears
// instantly from the cache.

import { useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import MediaPortal from '@/components/media/media-portal'
import MediaOptionsDrawer from '@/components/media/media-options-drawer'
import { useTranslation } from '@/lib/i18n/language-context'

export default function ChatMediaViewer({
  url, type, senderName, canReply, onReply, onClose,
}: {
  url: string
  type: 'image' | 'video'
  /** Whose media this is - shown by the share sheet. */
  senderName?: string
  /** False when the chat is read-only (blocked, not mutual): the reply field is hidden. */
  canReply: boolean
  /** Sends `text` as a reply to this photo/video. Return false if it could not be queued. */
  onReply: (text: string) => boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuH, setMenuH] = useState(0)   // open drawer's height: the picture moves up to clear it
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const canSend = text.trim().length > 0

  function send() {
    if (!canSend) return
    if (onReply(text.trim())) onClose()   // back to the chat, where the reply now sits
  }

  const replyField = canReply ? (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'var(--viewer-control-bg)', borderRadius: 999,
      padding: '4px 4px 4px 18px', margin: '0 4px',
    }}>
      <input
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
        placeholder={t('chat.reply_placeholder')}
        aria-label={t('chat.reply_placeholder')}
        maxLength={4000}
        enterKeyHint="send"
        style={{
          flex: 1, minWidth: 0, height: 40, background: 'none', border: 'none', outline: 'none',
          color: 'var(--viewer-fg)', fontSize: 15, fontFamily: "'DM Sans', sans-serif",
          caretColor: 'var(--color-brand)',
        }}
      />
      {canSend && (
        <button
          type="button"
          aria-label={t('chat.send_message')}
          onClick={send}
          style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none', flexShrink: 0,
            background: 'var(--color-brand)', color: 'var(--viewer-fg)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ArrowUp size={18} />
        </button>
      )}
    </div>
  ) : null

  return (
    <>
      <MediaPortal
        label={type === 'video' ? t('notif.video') : t('notif.photo')}
        onClose={onClose}
        onMenu={() => setMenuOpen(true)}
        bottomInset={menuH}
        footer={replyField}
      >
        {type === 'video' ? (
          <video
            src={url} controls autoPlay playsInline
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 16 }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url} alt="" decoding="async" draggable={false}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 16, display: 'block', userSelect: 'none' }}
          />
        )}
      </MediaPortal>
      <MediaOptionsDrawer
        open={menuOpen} onClose={() => setMenuOpen(false)}
        url={url} kind={type} shareTitle={senderName}
        onHeight={setMenuH}
      />
    </>
  )
}
