'use client'

// src/components/chat/chat-viewport.tsx
//
// Wraps a chat screen so that, on phones, it fills exactly the part of the
// screen that is actually visible - i.e. everything ABOVE the on-screen
// keyboard - with the message box pinned to its bottom edge.
//
// Why this is needed: on mobile browsers the keyboard usually shrinks only the
// "visual viewport", not the layout, so `height: 100dvh` (and bottom-fixed
// elements) end up hidden behind the keyboard or floating in the wrong place.
// window.visualViewport reports the real visible rectangle, so we size the
// wrapper to it and keep it in sync as the keyboard opens and closes.
//
// On desktop (>= 768px) nothing changes: it is a plain full-height column
// inside the page, next to the sidebars.

import { useEffect, useRef } from 'react'

export default function ChatViewport({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const vv = window.visualViewport
    const mobile = window.matchMedia('(max-width: 767px)')

    // Was the message list scrolled to (near) the bottom before the resize?
    let stickToBottom = true
    const list = () => el.querySelector<HTMLElement>('[data-chat-messages]')
    const onListScroll = () => {
      const l = list()
      if (l) stickToBottom = l.scrollHeight - l.scrollTop - l.clientHeight < 160
    }

    function apply() {
      if (!el) return
      if (!mobile.matches || !vv) {
        el.style.top = ''
        el.style.height = ''
        document.body.style.overflow = ''
        return
      }
      el.style.top = `${vv.offsetTop}px`
      el.style.height = `${vv.height}px`
      // Keep the page itself from scrolling behind the chat.
      document.body.style.overflow = 'hidden'
      // Keyboard opened/closed: keep the latest messages in view.
      const l = list()
      if (l && stickToBottom) l.scrollTop = l.scrollHeight
    }

    // Tell the app shell a chat thread is open so it hides the mobile bottom nav
    // and top bar (see the html[data-chat-open] rules in (main)/layout.tsx).
    document.documentElement.dataset.chatOpen = 'true'

    apply()
    const l = list()
    l?.addEventListener('scroll', onListScroll, { passive: true })
    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply)
    mobile.addEventListener('change', apply)

    return () => {
      l?.removeEventListener('scroll', onListScroll)
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
      mobile.removeEventListener('change', apply)
      delete document.documentElement.dataset.chatOpen
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div ref={ref} className="chat-viewport">
      <style>{`
        .chat-viewport { display: flex; flex-direction: column; height: 100dvh; }
        @media (max-width: 767px) {
          .chat-viewport {
            position: fixed; left: 0; right: 0; top: 0;
            z-index: 150; background: var(--color-bg);
            overscroll-behavior: contain;
          }
        }
      `}</style>
      {children}
    </div>
  )
}
