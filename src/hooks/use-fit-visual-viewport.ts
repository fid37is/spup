'use client'

import { useEffect, type RefObject } from 'react'

/**
 * Sizes a fixed, full-screen element to the part of the screen that is actually visible,
 * i.e. everything ABOVE the on-screen keyboard, so a bottom bar inside it sits directly on
 * top of the keyboard. Same technique ChatViewport uses for the chat and post composers,
 * for a screen that has to stay above other layers (the quote composer opens over the
 * media viewer, so it can't live inside ChatViewport's lower z-index).
 *
 * The element should start as `position: fixed; left: 0; right: 0; top: 0; height: 100dvh`.
 */
export function useFitVisualViewport(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = ref.current
    const vv = window.visualViewport
    if (!enabled || !el || !vv) return
    const apply = () => {
      el.style.top = `${vv.offsetTop}px`
      el.style.height = `${vv.height}px`
    }
    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      el.style.top = ''
      el.style.height = ''
    }
  }, [ref, enabled])
}
