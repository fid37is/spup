// src/components/notifications/avatar.tsx
'use client'

import { cloudinaryImage, fallbackToOriginal } from '@/lib/utils/cloudinary'

const COLORS = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A1A4A', '#4A7A1A']

export function NotifAvatar({
  name, url, size = 32, ring = false,
}: {
  name: string
  url?: string | null
  size?: number
  /** Brand-coloured ring (used for "unread" in the new-posts strip). */
  ring?: boolean
}) {
  const bg = COLORS[(name?.charCodeAt(0) ?? 0) % COLORS.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: url ? 'var(--color-surface-3)' : bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Syne', sans-serif", fontWeight: 800,
      fontSize: size * 0.36, color: 'white',
      boxShadow: ring ? '0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-brand)' : undefined,
    }}>
      {url
        ? <img
            src={cloudinaryImage(url, Math.max(96, size * 2))}
            alt={name}
            loading="lazy" decoding="async"
            onError={fallbackToOriginal(url)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        : (name || '?').slice(0, 2).toUpperCase()}
    </div>
  )
}
