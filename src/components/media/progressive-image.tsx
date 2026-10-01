'use client'

/**
 * Lazy, progressive image for feed media.
 *
 *  - Nothing is requested until the frame is near the viewport (so a slow
 *    connection isn't spent on images nobody has scrolled to yet).
 *  - Until then, and whenever the connection is offline/slow, the frame is a
 *    blank, softly pulsing box that already has its final shape (the parent
 *    supplies the aspect ratio), so the layout never jumps.
 *  - On a slow connection only a tiny (~32px) Cloudinary preview is fetched and
 *    shown blurred. When the connection recovers the full image is fetched
 *    automatically and sharpens in over the preview (blur + fade).
 *  - Tapping a frame that is still waiting forces the full image to load.
 *
 * Non-Cloudinary URLs have no tiny preview, so they stay a blank frame until
 * the connection is good enough (or the person taps).
 */

import { useEffect, useRef, useState } from 'react'
import { useNetworkStatus } from '@/lib/network-status'
import { cloudinaryImage, fallbackToOriginal } from '@/lib/utils/cloudinary'

const isCloudinary = (url: string) => url.includes('res.cloudinary.com') && url.includes('/image/upload/')

interface ProgressiveImageProps {
  src: string
  /** Width to request for the full-quality image. */
  width: number
  /** 'cover' fills the parent box (parent defines the shape); 'natural' sizes to the image. */
  fit?: 'cover' | 'natural'
  /** Used by 'natural' mode: the tallest the image may render. */
  maxHeight?: number
  /** Used by 'natural' mode: the blank frame's height before the image arrives. */
  placeholderHeight?: number
  alt?: string
}

export function ProgressiveImage({
  src, width, fit = 'cover', maxHeight, placeholderHeight = 200, alt = '',
}: ProgressiveImageProps) {
  const { isDegraded, isOffline } = useNetworkStatus()
  const holderRef = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const [force, setForce] = useState(false)
  const [thumbReady, setThumbReady] = useState(false)
  const [fullReady, setFullReady] = useState(false)
  const [failed, setFailed] = useState(false)

  // Start loading only once the frame is close to the screen.
  useEffect(() => {
    const el = holderRef.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return }
    const obs = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setNear(true); obs.disconnect() }
    }, { rootMargin: '300px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const slow = isDegraded || isOffline
  const hasThumb = isCloudinary(src)
  const wantThumb = near && hasThumb && !isOffline
  const wantFull = near && (force || !slow)

  const natural = fit === 'natural'
  const layer: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }

  return (
    <div
      ref={holderRef}
      onClick={() => { if (!fullReady) setForce(true) }}
      style={{
        position: 'relative', overflow: 'hidden',
        background: 'var(--color-surface-2)',
        width: natural && fullReady ? undefined : '100%',
        height: natural ? undefined : '100%',
        minHeight: natural && !fullReady ? placeholderHeight : undefined,
        animation: !fullReady && !thumbReady ? 'mediaPulse 1.6s ease-in-out infinite' : undefined,
      }}
    >
      {wantThumb && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cloudinaryImage(src, 32)} alt="" aria-hidden decoding="async"
          onLoad={() => setThumbReady(true)}
          style={{
            ...layer,
            filter: 'blur(14px)', transform: 'scale(1.1)',
            opacity: thumbReady && !fullReady ? 1 : 0,
            transition: 'opacity 0.4s ease',
          }}
        />
      )}

      {wantFull && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cloudinaryImage(src, width)} alt={alt} decoding="async"
          onLoad={() => setFullReady(true)}
          onError={e => {
            if (e.currentTarget.dataset.fellBack === '1') { setFailed(true); return }
            fallbackToOriginal(src)(e)
          }}
          style={natural
            ? {
                display: 'block', position: 'relative', width: 'auto', height: 'auto',
                maxWidth: '100%', maxHeight,
                opacity: fullReady ? 1 : 0, filter: fullReady ? 'none' : 'blur(12px)',
                transition: 'opacity 0.5s ease, filter 0.5s ease',
              }
            : {
                ...layer,
                opacity: fullReady ? 1 : 0, filter: fullReady ? 'none' : 'blur(12px)',
                transition: 'opacity 0.5s ease, filter 0.5s ease',
              }}
        />
      )}
    </div>
  )
}
