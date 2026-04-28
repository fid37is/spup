'use client'

import { useState, useEffect, useRef } from 'react'
import { Pencil, X } from 'lucide-react'
import PostComposer from '@/app/(main)/feed/post-composer'

// Floating compose button — only for feed page.
// Visible when user is scrolled near the bottom (recent posts).
// Hides when scrolled to top. Opens a modal composer on click.

export default function FloatingComposeBtn({ onPosted }: { onPosted?: (post: unknown) => void }) {
  const [visible, setVisible] = useState(false)
  const [open, setOpen] = useState(false)
  const lastScrollY = useRef(0)
  const ticking = useRef(false)

  useEffect(() => {
    function onScroll() {
      if (ticking.current) return
      ticking.current = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        const scrollingUp = y < lastScrollY.current
        // Visible at top, hidden when scrolling down into older posts
        setVisible(y < 100 || scrollingUp)
        lastScrollY.current = y
        ticking.current = false
      })
    }
    setVisible(true)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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

      {/* Composer modal */}
      {open && (
        <>
          {/* Backdrop */}
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
            {/* Modal header */}
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
            <PostComposer
              onPosted={post => {
                setOpen(false)
                onPosted?.(post)
              }}
            />
          </div>
        </>
      )}
    </>
  )
}