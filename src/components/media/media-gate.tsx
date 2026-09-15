'use client'

/**
 * Wraps a single media tile (image or video) so it doesn't fire off a new
 * network request over a degraded or offline connection unless the person
 * explicitly taps to load it. This only prevents *new* fetches - it has no
 * effect on media the browser already has cached from earlier.
 */

import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { useNetworkStatus } from '@/lib/network-status'

export function GatedMedia({
  render, style,
}: {
  render: () => React.ReactNode
  style?: React.CSSProperties
}) {
  const { isDegraded, isOffline } = useNetworkStatus()
  const [forceLoad, setForceLoad] = useState(false)

  if (forceLoad || (!isDegraded && !isOffline)) {
    return <>{render()}</>
  }

  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); setForceLoad(true) }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 6, width: '100%', height: '100%', minHeight: 80,
        background: 'var(--color-surface-2)', border: 'none', cursor: 'pointer',
        color: 'var(--color-text-muted)', fontSize: 12, padding: 12, textAlign: 'center',
        ...style,
      }}
    >
      <ImageOff size={20} />
      <span>{isOffline ? "Offline - media unavailable" : 'Slow connection - tap to load'}</span>
    </button>
  )
}
