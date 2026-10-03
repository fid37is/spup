// src/lib/native-back.ts
//
// A tiny stack of "what should the Android back button close?" callbacks.
// Popups (compose, media viewer, report, confirm...) register themselves
// while they are open (see hooks/use-back-close.ts). NativeBootstrap asks
// this stack first: if a popup is open, back closes it - and only the
// top-most one - instead of leaving the page or minimising the app.
//
// Does nothing on the web: nothing calls runTopBackHandler() there.

const stack: Array<() => void> = []

/** Registers a handler. Returns the function that unregisters it. */
export function registerBackHandler(handler: () => void): () => void {
  stack.push(handler)
  return () => {
    const i = stack.lastIndexOf(handler)
    if (i !== -1) stack.splice(i, 1)
  }
}

/** Runs the top-most handler. Returns true if one existed (back was consumed). */
export function runTopBackHandler(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top()
  return true
}
