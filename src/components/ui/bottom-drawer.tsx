'use client'

// src/components/ui/bottom-drawer.tsx
//
// One bottom drawer for the whole app (repost options, the media "..." menu, the
// comments sheet inside the media viewer). Same look as the Threads sheets:
// rounded top, drag handle, optional centred title, rows grouped in soft cards.
//
//   <BottomDrawer open={open} onClose={close} title="Repost options">
//     <DrawerGroup>
//       <DrawerItem label="Quote" icon={<Quote size={20} />} onClick={...} />
//     </DrawerGroup>
//   </BottomDrawer>
//
// - Portaled to document.body (same reason as ConfirmModal: `body > * { z-index: 1 }`
//   in globals.css would otherwise trap it under the mobile bottom nav).
// - Closes on backdrop tap, Escape, the Android back button, or by dragging it down.
// - Clicks never reach the post card underneath: React bubbles events through
//   portals, and the card is a clickable <article> that would open the post.
// - z-index sits above the media viewer (300) and the quote composer (350).
// - Locks page scroll while open (shared counted lock, see lib/scroll-lock.ts).
// - Form / long-content sheets: put the content in <DrawerBody> so it scrolls inside the
//   sheet, and pass `avoidKeyboard` if it has a text field.

import { Children, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBackClose } from '@/hooks/use-back-close'
import { lockBodyScroll } from '@/lib/scroll-lock'

const GROUP_BG = 'color-mix(in srgb, var(--color-text-primary) 7%, var(--color-surface-raised))'
const DISMISS_DRAG_PX = 90

export function BottomDrawer({
  open, onClose, title, children, height, zIndex = 400, label, backdrop, onHeight, avoidKeyboard = false,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  /** Fixed sheet height (e.g. '70dvh') for sheets with a scrolling list. Default: as tall as the content. */
  height?: string
  zIndex?: number
  /** Accessible name when there is no visible title. */
  label?: string
  /** Colour of the layer behind the sheet. Default is the app's dark overlay; the media
   *  viewer passes a light one (or 'transparent') so the picture stays visible. */
  backdrop?: string
  /** Reports the sheet's height in px while it is open (0 when closed), so a screen behind
   *  it can make room - the media viewer lifts the picture clear of the sheet. */
  onHeight?: (px: number) => void
  /** Lift the sheet above the on-screen keyboard (for a sheet with a text field). The
   *  keyboard shrinks the visual viewport, not the layout one, so a plain `bottom: 0`
   *  sheet would sit behind it - same issue and same fix as the post page's reply bar. */
  avoidKeyboard?: boolean
}) {
  const [mounted, setMounted] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [keyboardH, setKeyboardH] = useState(0)
  const onHeightRef = useRef(onHeight)
  useEffect(() => { onHeightRef.current = onHeight })
  useEffect(() => setMounted(true), [])
  useBackClose(open, onClose)

  // The page behind a drawer must not scroll. Counted, so it can't fight another lock
  // (the media viewer holds one while its own drawers are open).
  useEffect(() => {
    if (!open) return
    return lockBodyScroll()
  }, [open])

  // offsetHeight ignores the slide-in / drag transform, so the picture starts moving
  // up at the same moment the sheet starts sliding up.
  useEffect(() => {
    if (!open || !mounted) return
    const el = sheetRef.current
    if (!el) return
    const report = () => onHeightRef.current?.(el.offsetHeight)
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => { ro.disconnect(); onHeightRef.current?.(0) }
  }, [open, mounted])

  // Escape closes the drawer only - not the viewer behind it. Listening in the
  // capture phase on window means this runs first and can stop the event there.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !avoidKeyboard) return
    const vv = window.visualViewport
    if (!vv) return
    const apply = () => setKeyboardH(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      setKeyboardH(0)
    }
  }, [open, avoidKeyboard])

  if (!open || !mounted) return null

  function onPointerDown(e: React.PointerEvent) {
    startY.current = e.clientY
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return
    setDragY(Math.max(0, e.clientY - startY.current))
  }
  function onPointerUp() {
    if (!dragging) return
    setDragging(false)
    const dismiss = dragY > DISMISS_DRAG_PX
    setDragY(0)   // reset first, so the next time it opens it isn't left offset
    if (dismiss) onClose()
  }

  return createPortal(
    <>
      <div
        onClick={e => { e.stopPropagation(); onClose() }}
        style={{ position: 'fixed', inset: 0, zIndex, background: backdrop ?? 'var(--overlay-bg)', animation: 'fadeIn 0.18s ease' }}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? label}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: keyboardH, zIndex: zIndex + 1,
          margin: '0 auto', width: '100%', maxWidth: 520,
          height, maxHeight: '88dvh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--color-surface-raised)',
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          boxShadow: '0 -8px 30px rgba(0,0,0,0.4)',
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : 'transform 0.2s ease, bottom 0.1s ease-out',
          animation: 'drawerUp 0.2s ease-out',
        }}
      >
        {/* Handle + title: the drag area (touch-action none so the page doesn't scroll instead) */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ flexShrink: 0, touchAction: 'none', cursor: 'grab', padding: '10px 16px 0' }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border-light)', margin: '0 auto 12px' }} />
          {title && (
            <div style={{
              textAlign: 'center', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 17,
              color: 'var(--color-text-primary)', padding: '2px 0 14px',
            }}>
              {title}
            </div>
          )}
        </div>

        <div style={{
          flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
          padding: '0 12px calc(env(safe-area-inset-bottom, 0px) + 12px)',
        }}>
          {children}
        </div>
      </div>
    </>,
    document.body
  )
}

/** A soft rounded card holding one or more DrawerItems, with hairline dividers between them. */
export function DrawerGroup({ children }: { children: React.ReactNode }) {
  const items = Children.toArray(children)
  return (
    <div style={{ background: GROUP_BG, borderRadius: 18, overflow: 'hidden', marginBottom: 10, flexShrink: 0 }}>
      {items.map((child, i) => (
        <div key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--color-border-light)' }}>
          {child}
        </div>
      ))}
    </div>
  )
}

/** One row: label on the left, icon on the right (as in the Threads sheets). */
export function DrawerItem({
  label, icon, onClick, destructive = false, disabled = false, color,
}: {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  destructive?: boolean
  disabled?: boolean
  /** Text/icon colour for a row that is neither plain nor destructive (e.g. brand green, muted). */
  color?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        width: '100%', minHeight: 58, padding: '0 20px',
        background: 'none', border: 'none', textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        color: destructive ? 'var(--color-error)' : (color ?? 'var(--color-text-primary)'),
        fontSize: 16, fontWeight: 500, fontFamily: "'DM Sans', sans-serif",
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span>{label}</span>
      {icon}
    </button>
  )
}

/** Scrolling content area for a drawer that holds a form or a long list (not a row menu). */
export function DrawerBody({ children, padding = '0 8px 8px' }: { children: React.ReactNode; padding?: string }) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding }}>
      {children}
    </div>
  )
}
