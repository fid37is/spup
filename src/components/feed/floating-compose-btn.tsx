// src/components/feed/floating-compose-btn.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { Pencil, X, Loader2 } from 'lucide-react'
import PostComposer, { type PostComposerHandle } from '@/app/(main)/feed/post-composer'

// Floating compose button — only for feed page.
// Visible when user is scrolled near the bottom (recent posts).
// Hides when scrolled to top. Opens the composer on click:
//   - Desktop: centered modal dialog
//   - Mobile:  full-screen sheet (X-style), Post button lives in the header

export default function FloatingComposeBtn({ onPosted, authorAvatarUrl, authorName }: { onPosted?: (post: unknown) => void; authorAvatarUrl?: string | null; authorName?: string }) {
  const [visible, setVisible] = useState(false)
  const [open, setOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [composerState, setComposerState] = useState({ canPost: false, isPending: false, hasUploading: false })
  const lastScrollY = useRef(0)
  const ticking = useRef(false)
  const composerRef = useRef<PostComposerHandle>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

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

  const { canPost, isPending, hasUploading } = composerState
  const postLabel = isPending ? 'Posting…' : hasUploading ? 'Uploading…' : 'Post'

  return (
    <>
      {/* FAB */}
      <style>{`
        .spup-fab { display: none; }
        @media (max-width: 767px) { .spup-fab { display: flex; } }
      `}</style>
      <button
        onClick={() => setOpen(true)}
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

      {open && (
        isMobile ? (
          /* ── Mobile: full-screen sheet ────────────────────────────────── */
          <div style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'var(--color-bg)',
            display: 'flex', flexDirection: 'column',
            animation: 'fadeIn 0.15s ease',
          }}>
            {/* Minimal top header — just close. Post lives at the bottom, not
                cramped against the status bar / notch. */}
            <div style={{
              display: 'flex', alignItems: 'center',
              padding: '16px 16px 8px',
              paddingTop: 'calc(20px + env(safe-area-inset-top))',
            }}>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)', display: 'flex', padding: 4 }}
              >
                <X size={22} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px' }}>
              <PostComposer
                ref={composerRef}
                variant="fullscreen"
                authorAvatarUrl={authorAvatarUrl}
                authorName={authorName}
                onStateChange={setComposerState}
                onPosted={handlePosted}
              />
            </div>

            {/* Docked Post bar at the bottom */}
            <div style={{
              padding: '12px 16px',
              paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
              borderTop: '1px solid var(--color-border)',
              display: 'flex', justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => composerRef.current?.submit()}
                disabled={!canPost}
                style={{
                  background: canPost ? 'var(--color-brand)' : 'var(--color-surface-2)',
                  color: canPost ? 'white' : 'var(--color-text-muted)',
                  border: 'none', borderRadius: 20, padding: '10px 26px',
                  fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
                  cursor: canPost ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', gap: 6, minHeight: 40,
                }}
              >
                {isPending && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />}
                {postLabel}
              </button>
            </div>
          </div>
        ) : (
          /* ── Desktop: centered modal ──────────────────────────────────── */
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
                <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--color-text-primary)' }}>
                  New post
                </span>
                <button
                  onClick={() => setOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: 4, borderRadius: '50%' }}
                >
                  <X size={20} />
                </button>
              </div>
              <PostComposer variant="modal" authorAvatarUrl={authorAvatarUrl} authorName={authorName} onPosted={handlePosted} />
            </div>
          </>
        )
      )}
    </>
  )
}