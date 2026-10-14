'use client'

import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'

const LANDING_AD_SLOT = '4390998038'

// Single responsive AdSense display ad for the public landing page.
// Web only: AdSense isn't allowed inside the Android app (AdMob covers that).
export default function LandingAd() {
  const [show, setShow] = useState(false)
  const pushed = useRef(false)
  const publisherId = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID

  useEffect(() => {
    if (!publisherId || Capacitor.isNativePlatform()) return
    setShow(true)
  }, [publisherId])

  useEffect(() => {
    if (!show || pushed.current) return
    pushed.current = true
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {}
  }, [show])

  if (!show) return null

  return (
    <section className="section-pad-b" style={{ paddingTop: 0, paddingBottom: 0 }}>
      <div className="section-inner">
        <div style={{
          margin: '8px auto', padding: '10px 12px',
          border: '1px solid var(--color-border)', borderRadius: 12,
          background: 'var(--color-surface)', overflow: 'hidden',
        }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 6, letterSpacing: '0.06em' }}>
            SPONSORED
          </div>
          <ins
            className="adsbygoogle"
            style={{ display: 'block' }}
            data-ad-client={publisherId}
            data-ad-slot={LANDING_AD_SLOT}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        </div>
      </div>
    </section>
  )
}