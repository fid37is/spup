// src/components/feed/floating-compose-btn.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
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
  const [sheetHeight, setSheetHeight] = useState<number | null>(null)

  // Track the *visual* viewport, not the layout viewport. `position: fixed`
  // sized via inset:0 stays pinned to the full layout viewport on most mobile
  // browsers even when the on-screen keyboard opens — it doesn't shrink, so a
  // bottom-pinned toolbar ends up hidden behind the keyboard instead of
  // sitting above it. Listening to visualViewport and applying an explicit
  // height keeps the sheet (and everything pinned to its bottom) tracking
  // what's actually visible above the keyboard.
  useEffect(() => {
    if (!open || !isMobile) return
    const vv = window.visualViewport
    if (!vv) return

    function updateHeight() {
      setSheetHeight(vv!.height)
    }
    updateHeight()
    vv.addEventListener('resize', updateHeight)
    return () => vv.removeEventListener('resize', updateHeight)
  }, [open, isMobile])

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
        isMobile ? createPortal(
          /* ── Mobile: full-screen sheet, portaled to <body> ──────────────
             .main-layout and .mobile-nav are BOTH direct children of body
             (ToastProvider/AppThemeProvider render no wrapping DOM node),
             and `body > * { z-index: 1 }` in globals.css pins them to the
             same stacking context tier. Since .mobile-nav comes later in
             DOM order, it always painted over anything nested inside
             .main-layout, regardless of internal z-index. Portaling here
             makes this sheet a sibling of both, so its own z-index actually
             applies. */
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 300,
            height: sheetHeight ? `${sheetHeight}px` : '100dvh',
            background: 'var(--color-bg)',
            display: 'flex', flexDirection: 'column',
            animation: 'fadeIn 0.15s ease',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px',
              paddingTop: 'calc(12px + env(safe-area-inset-top))',
            }}>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)', display: 'flex', padding: 4 }}
              >
                <X size={22} />
              </button>
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
            </div>

            {/* Fills all remaining height — PostComposer pins its audience
                line + toolbar to the bottom of this space via flex, so the
                compose area genuinely stretches instead of everything
                clustering at the top. */}
            <div style={{ flex: 1, minHeight: 0, padding: '0 16px', display: 'flex', flexDirection: 'column' }}>
              <PostComposer
                ref={composerRef}
                variant="fullscreen"
                authorAvatarUrl={authorAvatarUrl}
                authorName={authorName}
                onStateChange={setComposerState}
                onPosted={handlePosted}
              />
            </div>
          </div>,
          document.body
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