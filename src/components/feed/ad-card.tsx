// src/components/feed/ad-card.tsx
'use client'

import { useEffect, useRef, useState } from 'react'

interface InternalAd {
  id: string
  impression_id: string
  title: string
  body: string | null
  image_url: string | null
  destination_url: string
  cta_label: string
}

interface AdSlotProps {
  postId: string        // the post this ad appears after
  position: number      // 0-indexed position in feed (show ad every ~5 posts)
}

export default function AdSlot({ postId, position }: AdSlotProps) {
  const [ad, setAd] = useState<InternalAd | null>(null)
  const [useAdsense, setUseAdsense] = useState(false)
  const [loading, setLoading] = useState(true)
  const adsenseRef = useRef<HTMLDivElement>(null)
  const clicked = useRef(false)

  useEffect(() => {
    fetch(`/api/ads/serve?post_id=${postId}`)
      .then(r => r.json())
      .then(data => {
        if (data.ad) setAd(data.ad)
        else if (data.use_adsense) setUseAdsense(true)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [postId])

  // Push AdSense unit once we know we need it
  useEffect(() => {
    if (!useAdsense || !adsenseRef.current) return
    try {
      // @ts-expect-error adsbygoogle is injected by Google script
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {}
  }, [useAdsense])

  if (loading) return null  // don't show skeleton for ads

  // ─── Internal ad ─────────────────────────────────────────────────────────
  if (ad) {
    function handleClick() {
      if (clicked.current) return
      clicked.current = true
      // Record click server-side (fire and forget)
      fetch('/api/ads/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_id: ad!.id, impression_id: ad!.impression_id }),
      }).catch(() => {})
      window.open(ad!.destination_url, '_blank', 'noopener,noreferrer')
    }

    return (
      <div style={{
        margin: '0', padding: '14px 20px',
        borderBottom: '1px solid #141414',
        borderLeft: '2px solid rgba(26,158,95,0.3)',
        background: 'rgba(26,158,95,0.02)',
      }}>
        {/* Sponsored label */}
        <div style={{ fontSize: 11, color: '#3A3A40', fontWeight: 500, letterSpacing: '0.06em', marginBottom: 10 }}>
          SPONSORED
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {ad.image_url && (
            <img
              src={ad.image_url} alt={ad.title}
              style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '1px solid #1E1E26' }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#D0D0C8', marginBottom: 4, fontFamily: "'Syne', sans-serif" }}>
              {ad.title}
            </p>
            {ad.body && (
              <p style={{ fontSize: 13, color: '#6A6A60', lineHeight: 1.5, marginBottom: 10 }}>{ad.body}</p>
            )}
            <button
              onClick={handleClick}
              style={{
                background: 'none', border: '1px solid rgba(26,158,95,0.4)',
                borderRadius: 20, padding: '5px 14px',
                fontSize: 12, color: '#1A9E5F', fontWeight: 600,
                cursor: 'pointer', fontFamily: "'Syne', sans-serif",
                transition: 'background 0.12s, border-color 0.12s',
              }}
            >
              {ad.cta_label}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── AdSense fallback ──────────────────────────────────────────────────────
  if (useAdsense && process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID) {
    return (
      <div style={{ padding: '8px 20px', borderBottom: '1px solid #141414' }}>
        <div style={{ fontSize: 11, color: '#3A3A40', marginBottom: 6, letterSpacing: '0.06em' }}>SPONSORED</div>
        <div ref={adsenseRef}>
          <ins
            className="adsbygoogle"
            style={{ display: 'block' }}
            data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID}
            data-ad-slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID}
            data-ad-format="fluid"
            data-ad-layout-key="-fb+5w+4e-db+86"
          />
        </div>
      </div>
    )
  }

  return null
}