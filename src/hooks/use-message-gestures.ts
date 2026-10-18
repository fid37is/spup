'use client'

// src/hooks/use-message-gestures.ts
//
// Touch gestures for a chat message row:
//   - swipe right  -> reply (the row follows the finger, a reply icon fades in, a light haptic at the threshold)
//   - long press   -> open the message's options menu
//
// Mouse input does neither (desktop uses click / right-click / the hover button instead), but the hook
// remembers the last pointer type so the click handlers can tell touch from mouse on hybrid devices.
//
// How it stays out of the way of scrolling: the row sets `touch-action: pan-y`, so the browser keeps handling
// vertical panning itself (and then fires pointercancel, which ends the gesture). A swipe only "locks" once the
// finger has clearly gone sideways, to the right, and not near the screen edge (Android/iOS back-gesture zone).
//
// DOM expected inside the element the handlers are bound to:
//   [data-swipe-row]  the content that slides
//   [data-swipe-icon] (optional) the reply icon revealed behind it
// They are moved directly (no React state) so a drag costs no re-renders.

import { useCallback, useRef } from 'react'
import { lightHaptic } from '@/lib/haptics'

const LONG_PRESS_MS = 420
const MOVE_SLOP = 10          // px of movement that decides "this is a scroll / swipe, not a press"
const REPLY_THRESHOLD = 56    // px of drag that counts as "reply"
const MAX_PULL = 88
const EDGE_GUARD = 16         // px from either screen edge where a swipe is ignored (system back gesture)
const CLICK_SUPPRESS_MS = 450 // a click this soon after a gesture is the gesture's own tail, not a tap

interface Callbacks {
  onLongPress: (id: string) => void
  onSwipeReply: (id: string) => void
}

interface Flags {
  longPress: boolean
  swipe: boolean
}

interface Active {
  id: string
  pointerId: number
  x: number
  y: number
  swipeOk: boolean
  locked: boolean
  dead: boolean
  fired: boolean
  hit: boolean
  timer: ReturnType<typeof setTimeout> | null
}

function parts(wrapper: HTMLElement) {
  return {
    row: wrapper.querySelector<HTMLElement>('[data-swipe-row]'),
    icon: wrapper.querySelector<HTMLElement>('[data-swipe-icon]'),
  }
}

function setPull(wrapper: HTMLElement, px: number) {
  const { row, icon } = parts(wrapper)
  const progress = Math.min(px / REPLY_THRESHOLD, 1)
  if (row) { row.style.transition = ''; row.style.transform = px > 0 ? `translateX(${px}px)` : '' }
  if (icon) {
    icon.style.opacity = String(progress)
    icon.style.transform = `translateY(-50%) scale(${0.6 + 0.4 * progress})`
  }
}

function release(wrapper: HTMLElement) {
  const { row, icon } = parts(wrapper)
  if (row) {
    row.style.transition = 'transform 0.18s ease-out'
    row.style.transform = ''
    setTimeout(() => { row.style.transition = '' }, 220)
  }
  if (icon) { icon.style.opacity = '0'; icon.style.transform = 'translateY(-50%) scale(0.6)' }
}

export function useMessageGestures(callbacks: Callbacks) {
  const cb = useRef(callbacks)
  cb.current = callbacks
  const pointerType = useRef<string>('mouse')
  const lastGestureAt = useRef(0)
  const active = useRef<Active | null>(null)

  const clearTimer = () => {
    const a = active.current
    if (a?.timer) { clearTimeout(a.timer); a.timer = null }
  }

  const bind = useCallback((id: string, flags: Flags) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      pointerType.current = e.pointerType
      if (e.pointerType === 'mouse' || !e.isPrimary) return
      clearTimer()
      const a: Active = {
        id, pointerId: e.pointerId, x: e.clientX, y: e.clientY,
        swipeOk: flags.swipe && e.clientX > EDGE_GUARD && e.clientX < window.innerWidth - EDGE_GUARD,
        locked: false, dead: false, fired: false, hit: false, timer: null,
      }
      active.current = a
      if (flags.longPress) {
        a.timer = setTimeout(() => {
          a.timer = null
          if (active.current !== a || a.dead || a.locked) return
          a.fired = true
          lastGestureAt.current = Date.now()
          lightHaptic()
          cb.current.onLongPress(id)
        }, LONG_PRESS_MS)
      }
    },

    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const a = active.current
      if (!a || a.dead || a.fired || a.pointerId !== e.pointerId) return
      const dx = e.clientX - a.x
      const dy = e.clientY - a.y
      if (!a.locked) {
        if (Math.abs(dx) < MOVE_SLOP && Math.abs(dy) < MOVE_SLOP) return
        if (a.swipeOk && dx > MOVE_SLOP && dx > Math.abs(dy) * 1.2) {
          a.locked = true
          clearTimer()
          try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
        } else {
          // Scrolling, or a sideways move that is not a reply swipe: it is no longer a press either.
          a.dead = true
          clearTimer()
          return
        }
      }
      const shown = Math.min(Math.max(dx, 0), MAX_PULL)
      setPull(e.currentTarget, shown)
      if (!a.hit && dx >= REPLY_THRESHOLD) { a.hit = true; lightHaptic() }
      else if (a.hit && dx < REPLY_THRESHOLD) a.hit = false
    },

    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      const a = active.current
      if (!a || a.pointerId !== e.pointerId) return
      clearTimer()
      active.current = null
      if (a.locked) {
        release(e.currentTarget)
        lastGestureAt.current = Date.now()
        if (a.hit) cb.current.onSwipeReply(a.id)
      }
    },

    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
      const a = active.current
      if (!a || a.pointerId !== e.pointerId) return
      clearTimer()
      active.current = null
      if (a.locked) release(e.currentTarget)
    },
  }), [])

  return {
    bind,
    /** 'touch' | 'pen' | 'mouse' - what the last press on a message row was. */
    lastPointerType: () => pointerType.current,
    /** True right after a long press or swipe: the click that follows it must be ignored. */
    wasGesture: () => Date.now() - lastGestureAt.current < CLICK_SUPPRESS_MS,
  }
}