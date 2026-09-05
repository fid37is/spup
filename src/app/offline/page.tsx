// src/app/offline/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'

export default function OfflinePage() {
  const [checking, setChecking] = useState(false)
  const [online, setOnline]     = useState(false)

  useEffect(() => {
    function handleOnline() { setOnline(true) }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  useEffect(() => {
    if (online) goBack()
  }, [online])

  function goBack() {
    // document.referrer is often empty — fall back to /feed
    const ref = document.referrer
    const destination = ref && !ref.includes('/offline') ? ref : '/feed'
    window.location.href = destination
  }

  async function handleRetry() {
    setChecking(true)
    try {
      // GET is more universally supported than HEAD across proxies/service workers
      const res = await fetch('/api/health', { cache: 'no-store' })
      if (res.ok) {
        goBack()
        return
      }
    } catch {
      // Still offline
    }
    setChecking(false)
  }

  return (
    <div style={{
      minHeight: '100dvh', background: '#0A0A0A',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif", padding: 24, textAlign: 'center',
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: '#161616', border: '1px solid #2A2A2A',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24, color: '#6A6A60',
      }}>
        <WifiOff size={36} strokeWidth={1.5} />
      </div>

      <h1 style={{
        fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 28,
        color: '#F5F5F0', letterSpacing: '-0.02em', marginBottom: 12,
      }}>
        You&apos;re offline
      </h1>

      <p style={{
        fontSize: 15, color: '#6A6A60', lineHeight: 1.65,
        maxWidth: 300, marginBottom: 36,
      }}>
        Check your connection and try again. Your unsent posts will be saved and posted when you&apos;re back online.
      </p>

      <button
        onClick={handleRetry}
        disabled={checking}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: checking ? '#124D30' : '#1A7A4A',
          color: 'white', border: 'none',
          borderRadius: 24, padding: '13px 32px',
          fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
          cursor: checking ? 'default' : 'pointer',
          letterSpacing: '0.01em',
          transition: 'background 0.15s',
          minWidth: 148,
        }}
      >
        <RefreshCw
          size={16}
          style={{ animation: checking ? 'spin 0.8s linear infinite' : 'none' }}
        />
        {checking ? 'Checking…' : 'Try again'}
      </button>

      <p style={{ marginTop: 20, fontSize: 13, color: '#3A3A3A' }}>
        <Wifi size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} />
        Reconnects automatically when back online
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}