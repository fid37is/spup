'use client'

// src/components/media/media-portal.tsx
//
// The full-screen "portal" both media viewers (feed posts and chat) are built on.
// Not a modal: it is its own black screen with
//
//   [X]                                [...]      <- close left, options right
//
//                   (the media)
//
//   footer (post actions, or the chat reply box)
//
// - Always black, in light and dark theme (see the --viewer-* tokens in globals.css).
// - Portaled to document.body: `body > * { z-index: 1 }` in globals.css would
//   otherwise trap a full-screen layer under the mobile bottom nav (see ConfirmModal).
// - Closes with the X, Escape, a tap on empty black space, or the Android back button.
// - Stops clicks from reaching the post card / chat bubble it was opened from
//   (React bubbles events through portals).

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Ellipsis, X } from 'lucide-react'
import { useBackClose } from '@/hooks/use-back-close'
import { lockBodyScroll } from '@/lib/scroll-lock'
import { useTranslation } from '@/lib/i18n/language-context'

/** The round translucent buttons used for the viewer's chrome (close, options). */
export function ViewerIconButton({
  label, onClick, children, style,
}: {
  label: string
  onClick: (e: React.MouseEvent) => void
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={e => { e.stopPropagation(); onClick(e) }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--viewer-control-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--viewer-control-bg)' }}
      style={{
        width: 40, height: 40, borderRadius: '50%', border: 'none', flexShrink: 0,
        background: 'var(--viewer-control-bg)', color: 'var(--viewer-fg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'background 0.15s',
        WebkitTapHighlightColor: 'transparent', ...style,
      }}
    >
      {children}
    </button>
  )
}

export default function MediaPortal({
  onClose, onMenu, label, children, footer, bottomInset = 0,
}: {
  onClose: () => void
  /** Shows the "..." button when given (Share via... / Save). */
  onMenu?: () => void
  label: string
  /** The media itself, centred in the space between the top buttons and the footer. */
  children: React.ReactNode
  footer?: React.ReactNode
  /** Height (px) of a bottom drawer that is open over the viewer. The media moves up and
   *  shrinks to fit above it instead of being covered - the picture stays visible. */
  bottomInset?: number
}) {
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useBackClose(true, onClose)

  // The drawer slides over the footer too, so the media only needs to clear whatever of
  // the drawer rises above the footer: measure the footer to know how much that is.
  const footerRef = useRef<HTMLDivElement>(null)
  const [footerH, setFooterH] = useState(0)
  useEffect(() => {
    const el = footerRef.current
    if (!el) { setFooterH(0); return }
    const ro = new ResizeObserver(() => setFooterH(el.offsetHeight))
    setFooterH(el.offsetHeight)
    return () => ro.disconnect()
  }, [mounted, !!footer])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Scroll lock lives in its own effect (mount/unmount only), so a changing onClose can't
  // release and re-take it while a drawer is open over the viewer.
  useEffect(() => lockBodyScroll(), [])

  if (!mounted) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'var(--viewer-bg)', color: 'var(--viewer-fg)',
        display: 'flex', flexDirection: 'column',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      {/* Close / options */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'calc(env(safe-area-inset-top, 0px) + 12px) 14px 0',
        pointerEvents: 'none',
      }}>
        <div style={{ pointerEvents: 'auto' }}>
          <ViewerIconButton label={t('chat.close')} onClick={onClose}><X size={20} /></ViewerIconButton>
        </div>
        {onMenu && (
          <div style={{ pointerEvents: 'auto' }}>
            <ViewerIconButton label={t('media.options')} onClick={onMenu}><Ellipsis size={20} /></ViewerIconButton>
          </div>
        )}
      </div>

      {/* Stage. The inner box is absolutely positioned so it has a definite height:
          that is what lets the media inside use `max-height: 100%` and still fit
          between the top buttons and the footer, whatever the screen. */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative' }}>
        <div
          onClick={e => { if (e.target === e.currentTarget) onClose() }}
          style={{
            position: 'absolute', left: 0, right: 0,
            bottom: Math.max(8, bottomInset - footerH + 8),
            top: 'calc(env(safe-area-inset-top, 0px) + 64px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            transition: 'bottom 0.22s ease',
          }}
        >
          {children}
        </div>
      </div>

      {footer && (
        <div ref={footerRef} style={{ flexShrink: 0, padding: '4px 10px calc(env(safe-area-inset-bottom, 0px) + 10px)' }}>
          {footer}
        </div>
      )}
    </div>,
    document.body
  )
}
