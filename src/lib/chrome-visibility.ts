// src/lib/chrome-visibility.ts
//
// One shared "is the app chrome showing?" flag for the mobile bottom nav and the
// floating compose button, so the two always appear and disappear together.
//
//   - near the top of the page (< TOP_ZONE px)  -> shown
//   - scrolling UP                                -> shown
//   - scrolling DOWN                              -> hidden
//
// A single passive scroll listener is attached while at least one component is
// subscribed (ref-counted below), instead of each component keeping its own copy
// of the same logic - which is how they used to drift apart.

import { useSyncExternalStore } from 'react'

const TOP_ZONE = 100   // px from the top where the chrome is always shown
const THRESHOLD = 6    // px of movement in one direction before it counts (ignores jitter / momentum wobble)

let visible = true
let lastY = 0
let ticking = false
const listeners = new Set<() => void>()

function setVisible(next: boolean) {
  if (next === visible) return
  visible = next
  listeners.forEach(l => l())
}

function onScroll() {
  if (ticking) return
  ticking = true
  requestAnimationFrame(() => {
    ticking = false
    const y = Math.max(0, window.scrollY)
    const dy = y - lastY
    if (y < TOP_ZONE) {
      setVisible(true)
      lastY = y
    } else if (dy <= -THRESHOLD) {
      setVisible(true)
      lastY = y
    } else if (dy >= THRESHOLD) {
      setVisible(false)
      lastY = y
    }
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    lastY = window.scrollY
    window.addEventListener('scroll', onScroll, { passive: true })
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener('scroll', onScroll)
      visible = true
    }
  }
}

/** Force the chrome visible (e.g. after navigating to another page). */
export function showChrome() {
  if (typeof window !== 'undefined') lastY = window.scrollY
  setVisible(true)
}

/** true = bottom nav + compose button are showing, false = scrolled away. */
export function useChromeVisible(): boolean {
  return useSyncExternalStore(subscribe, () => visible, () => true)
}