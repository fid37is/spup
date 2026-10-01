'use client'

// src/components/feed/post-modal.tsx
//
// The "new post" dialog opened from the sidebar and the mobile drawer. It used
// to be a second composer with its own upload and posting code (and its own
// "wait for uploads, then wait for the spinner" behaviour). It is now just the
// dialog frame around PostComposer - the same composer the feed button uses -
// so there is one set of posting behaviour: pick photos and videos in any
// order, type, tap Post, and the dialog closes while the post is sent in the
// background (progress line at the top, toast when it's sent).

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import PostComposer, { type PostComposerHandle } from '@/app/(main)/feed/post-composer'
import DraftsPanel from './drafts-panel'
import type { LocalDraft } from '@/lib/local-drafts'

interface PostModalProps {
  onClose: () => void
  /** Set when replying: the post being replied to. Omit for a new post. */
  parentPostId?: string
  replyTo?: {
    author: { display_name: string; username: string; avatar_url?: string | null }
    body: string | null
  }
  /** Where the "Reply sent" toast's View button goes (the thread the reply landed in). */
  viewHref?: string
  /** Called once the post/reply is live, with the created post (not when it is tapped - sending happens in the background). */
  onPosted?: (post: unknown) => void
  viewer?: {
    display_name: string
    avatar_url?: string | null
  }
  // Local drafts are scoped to this id - omitted (no signed-in profile) just skips autosave.
  userId?: string
}

export default function PostModal({ onClose, parentPostId, replyTo, viewHref, onPosted, viewer, userId }: PostModalProps) {
  const [showDrafts, setShowDrafts] = useState(false)
  const composerRef = useRef<PostComposerHandle>(null)

  function handleEditDraft(draft: LocalDraft) {
    setShowDrafts(false)
    composerRef.current?.loadDraft(draft)
  }

  return createPortal(
    <>
      {/* Portaled to <body> - globals.css sets `body > * { position: relative;
          z-index: 1 }`, which caps every direct child of body (like the
          .main-layout this modal would otherwise render inside) to its own
          stacking context. As a sibling of .main-layout its z-index (200)
          actually compares against other body-level layers (DraftsPanel: 400). */}
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(-12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

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
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border)',
            flexShrink: 0,
          }}>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: '50%',
              }}
            >
              <X size={18} />
            </button>
            {userId && !parentPostId && (
              <button
                onClick={() => setShowDrafts(true)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-brand)', fontFamily: "'Syne', sans-serif",
                  fontWeight: 700, fontSize: 14, padding: 4,
                }}
              >
                Drafts
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto' }}>
            <PostComposer
              ref={composerRef}
              variant="modal"
              authorName={viewer?.display_name}
              authorAvatarUrl={viewer?.avatar_url}
              userId={userId}
              replyTo={parentPostId && replyTo ? {
                id: parentPostId,
                authorName: replyTo.author.display_name,
                authorUsername: replyTo.author.username,
                authorAvatarUrl: replyTo.author.avatar_url ?? null,
                body: replyTo.body,
              } : null}
              viewHref={viewHref}
              // Handed to the background the moment Post is tapped - close now.
              onPosted={onClose}
              onCompleted={onPosted}
            />
          </div>
        </div>
      </div>

      {showDrafts && userId && !parentPostId && (
        <DraftsPanel
          userId={userId}
          onClose={() => setShowDrafts(false)}
          onEditDraft={handleEditDraft}
        />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>,
    document.body
  )
}