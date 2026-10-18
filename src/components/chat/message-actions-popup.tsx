'use client'

// src/components/chat/message-actions-popup.tsx
//
// The options menu for one chat message: a horizontal row of icon buttons anchored to the message
// (below it, or above it when there is no room, clamped inside the visible screen).
//
// The rest of the chat is dimmed behind it; the message itself is lifted above the dim by chat-client
// (z-index 41 vs the dim's 40), so it reads as "these options are for THIS message". Tapping the dim,
// pressing Escape, or picking an option closes it, and the composer underneath is never touched - so a
// half-typed message and the keyboard are exactly as they were.
//
// The anchor is looked up in the DOM (data-bubble-id) and re-measured on resize, so it stays put when the
// keyboard closes under the finger that opened it.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface MenuItem {
  key: string
  label: string
  icon: React.ReactNode
  onSelect: () => void
  danger?: boolean
  /** Second step of a two-step action (e.g. "Delete for everyone?"): drawn filled. */
  confirm?: boolean
  /** Keep the menu open after this item is chosen (the first step of a two-step action). */
  keepOpen?: boolean
}

const MARGIN = 8
const GAP = 8

export default function MessageActionsPopup({
  anchorId, mine, items, onClose, focusFirst = false,
}: {
  anchorId: string
  /** My message: the menu lines up with the bubble's right edge, otherwise its left edge. */
  mine: boolean
  items: MenuItem[]
  onClose: () => void
  /** Opened from the keyboard: put focus on the first option. */
  focusFirst?: boolean
}) {
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [tick, setTick] = useState(0)   // bumped when the screen is resized, to re-measure

  // Position: below the message if it fits, else above, else pinned to the bottom of the visible area
  // (a message taller than the screen). Measured after every render because the options can change width
  // (the Delete confirmation).
  useLayoutEffect(() => {
    const pop = popRef.current
    const bubble = document.querySelector<HTMLElement>(`[data-bubble-id="${CSS.escape(anchorId)}"]`)
    if (!pop || !bubble) return
    const a = bubble.getBoundingClientRect()
    // Layout size, not getBoundingClientRect(): that one is scaled by the pop-in animation, which made the first
    // measurement ~6% too small and the menu jump when it was corrected.
    const w = pop.offsetWidth
    const h = pop.offsetHeight
    const vv = window.visualViewport
    const top0 = vv?.offsetTop ?? 0
    const left0 = vv?.offsetLeft ?? 0
    const vh = vv?.height ?? window.innerHeight
    const vw = vv?.width ?? window.innerWidth

    let top = a.bottom + GAP
    if (top + h > top0 + vh - MARGIN) {
      const above = a.top - GAP - h
      top = above >= top0 + MARGIN ? above : top0 + vh - MARGIN - h
    }
    let left = mine ? a.right - w : a.left
    left = Math.max(left0 + MARGIN, Math.min(left, left0 + vw - MARGIN - w))
    top = Math.round(top)
    left = Math.round(left)
    setPos(prev => (prev && prev.top === top && prev.left === left ? prev : { top, left }))
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    // Re-measure shortly after a resize (the keyboard animating closed) instead of closing.
    let t: ReturnType<typeof setTimeout> | null = null
    const onResize = () => { if (t) clearTimeout(t); t = setTimeout(() => setTick(n => n + 1), 60) }
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    return () => {
      if (t) clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
    }
  }, [onClose])

  useEffect(() => {
    if (focusFirst) popRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [focusFirst])

  void tick

  return (
    <>
      {/* The dim. Tapping it (or right-clicking it) just closes the menu. */}
      <div
        aria-hidden
        onClick={onClose}
        onContextMenu={e => { e.preventDefault(); onClose() }}
        style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.38)', touchAction: 'none' }}
      />
      <div
        ref={popRef}
        role="menu"
        style={{
          position: 'fixed', zIndex: 42, top: pos?.top ?? 0, left: pos?.left ?? 0,
          visibility: pos ? 'visible' : 'hidden',
          display: 'flex', alignItems: 'stretch', gap: 2, padding: 4,
          maxWidth: 'calc(100vw - 16px)', overflowX: 'auto', boxSizing: 'border-box',
          background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
          borderRadius: 18, boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
          animation: 'chat-pop-in 0.12s ease-out',
        }}
      >
        {items.map(it => (
          <button
            key={it.key}
            role="menuitem"
            type="button"
            onClick={e => { e.stopPropagation(); it.onSelect(); if (!it.keepOpen) onClose() }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              minWidth: it.confirm ? 96 : 58, padding: '9px 10px', border: 'none', cursor: 'pointer',
              borderRadius: 14, flexShrink: 0,
              fontSize: 11, lineHeight: 1.2, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
              background: it.confirm ? 'var(--color-error)' : 'transparent',
              color: it.confirm ? 'white' : it.danger ? 'var(--color-error)' : 'var(--color-text-primary)',
            }}
          >
            {it.icon}
            <span style={{ whiteSpace: it.confirm ? 'normal' : 'nowrap', textAlign: 'center' }}>{it.label}</span>
          </button>
        ))}
      </div>
      <style>{`@keyframes chat-pop-in { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </>
  )
}