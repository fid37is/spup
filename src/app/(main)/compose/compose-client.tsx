'use client'

// src/app/(main)/compose/compose-client.tsx
//
// The phone composer, as a full page. Same header (close / Drafts / Post) and
// same PostComposer as the old sheet; the difference is that it is the only
// thing on screen. ChatViewport pins it to the part of the screen that is
// actually visible above the keyboard - including when the browser pans the
// page - so the toolbar always sits directly on top of the keyboard.

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2 } from 'lucide-react'
import PostComposer, { type PostComposerHandle, type ReplyToContext } from '@/app/(main)/feed/post-composer'
import DraftsPanel from '@/components/feed/drafts-panel'
import ChatViewport from '@/components/chat/chat-viewport'
import type { LocalDraft } from '@/lib/local-drafts'

// The feed picks this up when it mounts and shows the new post at the top.
const JUST_POSTED_KEY = 'spup:just-posted'   // keep in sync with feed-client.tsx

export default function ComposeClient({ userId, authorAvatarUrl, authorName, replyTo = null, replyChain = [], returnTo }: {
  userId?: string
  authorAvatarUrl?: string | null
  authorName?: string
  replyTo?: ReplyToContext | null
  /** Ancestors above replyTo, root-first - stacked on screen the way Threads shows the thread leading up to what you're replying to. */
  replyChain?: ReplyToContext[]
  /** The post detail page this reply was opened from - land back there after posting, not on the replied-to comment's own page. */
  returnTo?: string
}) {
  const router = useRouter()
  const composerRef = useRef<PostComposerHandle>(null)
  const [showDrafts, setShowDrafts] = useState(false)
  const [composerState, setComposerState] = useState({
    canPost: false, isPending: false, hasUploading: false, isScheduled: false,
  })

  function leave() {
    // Back to wherever they came from; if this page was opened directly, the feed.
    if (window.history.length > 1) router.back()
    else router.replace('/feed')
  }

  function handlePosted(post: unknown) {
    // A reply: go back to the post detail page you were actually reading -
    // not the replied-to comment's own separate page, which is a different,
    // disorienting destination even though the reply is technically visible
    // there too. Falls back to the reply target itself only for an old link
    // that predates returnTo. A new post: hand it to the feed so it appears
    // at the top straight away (null = scheduled/queued offline: nothing to
    // show yet, either way).
    if (replyTo) {
      router.replace(`/post/${returnTo ?? replyTo.id}`)
      router.refresh()
      return
    }
    if (post) {
      try { sessionStorage.setItem(JUST_POSTED_KEY, JSON.stringify(post)) } catch { /* private mode */ }
    }
    router.replace('/feed')
  }

  function handleEditDraft(draft: LocalDraft) {
    setShowDrafts(false)
    composerRef.current?.loadDraft(draft)
  }

  const { canPost, isPending, isScheduled } = composerState
  const postLabel = replyTo
    ? (isPending ? 'Replying...' : 'Reply')
    : isPending
      ? (isScheduled ? 'Scheduling...' : 'Posting...')
      : (isScheduled ? 'Schedule' : 'Post')

  return (
    <ChatViewport>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', paddingTop: 'calc(12px + env(safe-area-inset-top))',
        flexShrink: 0,
      }}>
        <button
          onClick={leave}
          aria-label="Close"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)', display: 'flex', padding: 4 }}
        >
          <X size={22} />
        </button>
        {userId && !replyTo && (
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
        {/* Reply: no header submit button at all (matches the reference -
            just close, title, nothing at top right); the circular send
            button in the toolbar is the only way to submit, and it only
            renders once there's something to send. New post: unchanged,
            still submits from here. */}
        {!replyTo && (
          <button
            onClick={() => composerRef.current?.submit()}
            disabled={!canPost}
            style={{
              background: canPost ? 'var(--color-brand)' : 'var(--color-surface-2)',
              color: canPost ? 'white' : 'var(--color-text-muted)',
              border: 'none', borderRadius: 20, padding: '8px 20px',
              fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
              cursor: canPost ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 6, minHeight: 36,
            }}
          >
            {isPending && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />}
            {postLabel}
          </button>
        )}
      </div>

      {/* Fills all remaining height; PostComposer pins its toolbar to the bottom. */}
      <div style={{ flex: 1, minHeight: 0, padding: '0 16px', display: 'flex', flexDirection: 'column' }}>
        <PostComposer
          ref={composerRef}
          variant="fullscreen"
          authorAvatarUrl={authorAvatarUrl}
          authorName={authorName}
          userId={userId}
          replyTo={replyTo}
          replyChain={replyChain}
          onStateChange={setComposerState}
          onPosted={handlePosted}
        />
      </div>

      {showDrafts && userId && !replyTo && (
        <DraftsPanel
          userId={userId}
          onClose={() => setShowDrafts(false)}
          onEditDraft={handleEditDraft}
        />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </ChatViewport>
  )
}