'use client'

import { useEffect } from 'react'

export function usePWA() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    // Register service worker
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(reg => {
        console.log('Spup SW registered:', reg.scope)

        // Check for updates every 60 seconds
        setInterval(() => reg.update(), 60_000)

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available — could show a toast here
              console.log('New Spup version available. Refresh to update.')
            }
          })
        })
      })
      .catch(err => console.error('SW registration failed:', err))

    // Handle offline/online state
    function handleOnline() { document.title = document.title.replace(' (offline)', '') }
    function handleOffline() { document.title += ' (offline)' }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])
}
