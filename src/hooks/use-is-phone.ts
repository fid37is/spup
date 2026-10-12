'use client'

import { useEffect, useState } from 'react'

/**
 * True on a phone-sized screen (same 767px breakpoint the rest of the app uses for "mobile").
 * Starts false on the server and on first render, then updates, so it never causes a
 * hydration mismatch. Use it to pick a BottomDrawer on phones and a dialog on desktop.
 */
export function useIsPhone(maxWidth = 767) {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    setPhone(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setPhone(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [maxWidth])
  return phone
}
