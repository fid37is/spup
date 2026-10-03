'use client'

import { useEffect, useRef } from 'react'

/**
 * Pull-down-to-refresh for the Android/iOS app.
 *
 * The Capacitor WebView has no refresh gesture of its own (Chrome's built-in
 * one only exists in a real browser tab), so this adds it. It only does
 * anything inside the native app; on the plain web/PWA it renders an
 * invisible element and attaches nothing.
 *
 * A pull counts only when it starts with the page scrolled to the very top,
 * is mostly vertical, and does not start inside something that is itself
 * scrolled (a media viewer, a long list in a sheet, ...). Chat threads are
 * skipped entirely so scrolling up through older messages never reloads.
 */

const THRESHOLD = 70   // px of damped pull needed to trigger a refresh
const MAX_PULL = 110   // the indicator stops following the finger here
const DEAD_ZONE = 10   // px of downward travel before a pull starts
const DAMPING = 0.5    // finger travel -> indicator travel
const SIZE = 36

const IGNORED_TARGETS = '[role="dialog"], [aria-modal="true"], video, input, textarea, select, [data-no-ptr]'

function pageScrollTop() {
  return document.scrollingElement?.scrollTop ?? 0
}

/** True when the touch began inside an element that is scrolled away from its top. */
function startsInsideScrolledArea(el: Element | null) {
  let node: Element | null = el
  while (node && node !== document.body && node !== document.documentElement) {
    if (node instanceof HTMLElement) {
      const oy = getComputedStyle(node).overflowY
      if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight && node.scrollTop > 0) {
        return true
      }
    }
    node = node.parentElement
  }
  return false
}

export default function NativePullToRefresh() {
  const barRef = useRef<HTMLDivElement>(null)
  const spinRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (!cap?.isNativePlatform?.()) return

    const bar = barRef.current
    const spin = spinRef.current
    if (!bar || !spin) return

    let startX = 0
    let startY = 0
    let tracking = false
    let pulling = false
    let refreshing = false
    let pull = 0

    const render = (y: number, animate: boolean) => {
      const progress = Math.min(y / THRESHOLD, 1)
      bar.style.transition = animate ? 'transform 0.2s ease, opacity 0.2s ease' : 'none'
      bar.style.transform = `translate(-50%, ${y - SIZE - 8}px)`
      bar.style.opacity = String(progress)
      if (!refreshing) spin.style.transform = `rotate(${progress * 270}deg)`
    }

    const onStart = (e: TouchEvent) => {
      tracking = false
      pulling = false
      if (refreshing || e.touches.length !== 1) return
      if (window.location.pathname.startsWith('/messages')) return
      if (document.documentElement.hasAttribute('data-chat-open')) return
      if (pageScrollTop() > 0) return
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest(IGNORED_TARGETS)) return
      if (startsInsideScrolledArea(target)) return
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      tracking = true
    }

    const onMove = (e: TouchEvent) => {
      if (!tracking) return
      const dy = e.touches[0].clientY - startY
      const dx = e.touches[0].clientX - startX

      if (!pulling) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > DEAD_ZONE) { tracking = false; return }
        if (dy < -DEAD_ZONE) { tracking = false; return }   // scrolling down the page, not pulling
        if (dy < DEAD_ZONE) return
        pulling = true
      }

      if (pageScrollTop() > 0) {
        pulling = false
        tracking = false
        render(0, true)
        return
      }

      pull = Math.min(Math.max((dy - DEAD_ZONE) * DAMPING, 0), MAX_PULL)
      render(pull, false)
    }

    const onEnd = () => {
      const wasPulling = pulling
      tracking = false
      pulling = false
      if (!wasPulling) return

      if (pull >= THRESHOLD) {
        refreshing = true
        spin.style.animation = 'spin 0.7s linear infinite'
        render(THRESHOLD, true)
        // Safety net: if the reload never happens, let the person try again.
        window.setTimeout(() => {
          refreshing = false
          spin.style.animation = ''
          render(0, true)
        }, 8000)
        window.location.reload()
      } else {
        render(0, true)
      }
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return (
    <div
      ref={barRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        left: '50%',
        width: SIZE,
        height: SIZE,
        transform: `translate(-50%, ${-(SIZE + 8)}px)`,
        opacity: 0,
        pointerEvents: 'none',
        zIndex: 600,
        borderRadius: '50%',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-light)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        ref={spinRef}
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: '2px solid var(--color-border-light)',
          borderTopColor: 'var(--color-brand)',
        }}
      />
    </div>
  )
}
