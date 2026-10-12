// src/lib/scroll-lock.ts
//
// One shared, reference-counted lock for page scrolling. Every popup / viewer / drawer
// that must stop the page scrolling behind it calls lockBodyScroll() and runs the
// returned function when it closes.
//
// Why: several components used to set `document.body.style.overflow` themselves and
// "restore" whatever they found. When two were open at once (media viewer + its
// "..." / comments drawer), the second one saved 'hidden' as the value to restore, and
// depending on the order they unmounted in, the page was left at 'hidden' for good -
// the feed would not scroll until a pull-to-refresh reloaded it. With a counter the page
// is only unlocked when the LAST lock is released, and always back to its original value.

let locks = 0
let original = ''

/** Locks page scroll. Returns an idempotent unlock function (safe to call twice). */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (locks === 0) {
    original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  locks += 1

  let released = false
  return () => {
    if (released) return
    released = true
    locks = Math.max(0, locks - 1)
    if (locks === 0) document.body.style.overflow = original
  }
}
