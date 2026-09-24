'use client'

// src/components/layout/hide-mobile-header.tsx
//
// Mounted at the top of a page that has its own header (Notifications and its
// New posts / Settings sub-pages). Tells the app shell to hide its mobile top
// bar (logo, wallet, avatar drawer) so the page isn't showing two headers at
// once - same mechanism ChatViewport uses for a chat thread, see the
// html[data-notif-open] rule in (main)/layout.tsx.

import { useEffect } from 'react'

export default function HideMobileHeader() {
  useEffect(() => {
    document.documentElement.dataset.notifOpen = 'true'
    return () => { delete document.documentElement.dataset.notifOpen }
  }, [])
  return null
}
