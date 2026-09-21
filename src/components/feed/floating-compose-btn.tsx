// src/components/feed/floating-compose-btn.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Pencil, X } from 'lucide-react'
import PostComposer, { type PostComposerHandle } from '@/app/(main)/feed/post-composer'
import DraftsPanel from './drafts-panel'
import type { LocalDraft } from '@/lib/local-drafts'

// Floating compose button — only for feed page.
// Visible when user is scrolled near the bottom (recent posts).
// Hides when scrolled to top. Opens the composer on click:
//   - Desktop: centered modal dialog
//   - Mobile:  the /compose PAGE (app/(main)/compose). It used to be a sheet
//     drawn over the feed; with the feed still underneath, the page could move
//     when the keyboard opened and leave a gap above the keyboard. As a page
//     there is nothing underneath.

interface FloatingComposeBtnProps {
  onPosted?: (post: unknown) => void
  authorAvatarUrl?: string | null
  authorName?: string
  userId?: string
}

export default function FloatingComposeBtn({ onPosted, authorAvatarUrl, authorName, userId }: FloatingComposeBtnProps) {
  const [visible, setVisible] = useState(false)
  const [open, setOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showDrafts, setShowDrafts] = useState(false)
  const lastScrollY = useRef(0)
  const ticking = useRef(false)
  const composerRef = useRef<PostComposerHandle>(null)
  const router = useRouter()

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Warm the compose page as soon as we know we're on a phone, so tapping the
  // button opens it without waiting on a slow connection.
  useEffect(() => {
    if (isMobile) router.prefetch('/compose')
  }, [isMobile, router])

  useEffect(() => {
    function onScroll() {
      if (ticking.current) return
      ticking.current = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        const scrollingUp = y < lastScrollY.current
        setVisible(y < 100 || scrollingUp)
        lastScrollY.current = y
        ticking.current = false
      })
    }
    setVisible(true)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function handlePosted(post: unknown) {
    setOpen(false)
    onPosted?.(post)
  }

  function handleEditDraft(draft: LocalDraft) {
    setShowDrafts(false)
    composerRef.current?.loadDraft(draft)
  }

  return (
    <>
      {/* FAB */}
      <style>{`
        .spup-fab { display: none; }
        @media (max-width: 767px) { .spup-fab { display: flex; } }
      `}</style>
      <button
        onClick={() => (isMobile ? router.push('/compose') : setOpen(true))}
        aria-label="New post"
        className="spup-fab"
        style={{
          position: 'fixed',
          bottom: 'calc(72px + env(safe-area-inset-bottom))',
          right: 20,
          width: 56, height: 56,
          borderRadius: '50%',
          background: 'var(--color-brand)',
          border: 'none',
          boxShadow: '0 4px 20px rgba(26,158,95,0.45)',
          cursor: 'pointer',
          alignItems: 'center', justifyContent: 'center',
          color: 'white',
          zIndex: 90,
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.8) translateY(20px)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s ease',
          pointerEvents: visible ? 'auto' : 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Pencil size={22} />
      </button>

      {open && !isMobile && (
        /* Desktop: centered modal, portaled to <body> so its z-index compares
           against real body-level layers (DraftsPanel is 400) rather than being
           capped inside .main-layout's stacking context. */
          createPortal(
          <>
            <div
              onClick={() => setOpen(false)}
              style={{
                position: 'fixed', inset: 0,
                background: 'var(--overlay-bg)',
                zIndex: 150,
                animation: 'fadeIn 0.15s ease',
              }}
            />
            <div style={{
              position: 'fixed',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(600px, 95vw)',
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: 20,
              zIndex: 151,
              animation: 'modalIn 0.18s ease',
              overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px',
                borderBottom: '1px solid var(--color-border)',
              }}>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)', display: 'flex', padding: 4, borderRadius: '50%' }}
                >
                  <X size={20} />
                </button>
                {userId && (
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
              <PostComposer
                ref={composerRef}
                variant="modal"
                authorAvatarUrl={authorAvatarUrl}
                authorName={authorName}
                userId={userId}
                onPosted={handlePosted}
              />
            </div>
          </>,
          document.body
          )
      )}

      {showDrafts && userId && (
        <DraftsPanel
          userId={userId}
          onClose={() => setShowDrafts(false)}
          onEditDraft={handleEditDraft}
        />
      )}
    </>
  )
}