'use client'

// src/components/premium/subscribe-button.tsx
//
// The one Subscribe / Renew button used everywhere (wallet card, verification
// pages, /premium, the "how it works" article). Goes straight to Paystack
// payment — no extra page in between. Small and right-aligned by design;
// place it in a row if something should sit to its left.

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { isNativeApp, openCheckout } from '@/lib/native'
import { formatNaira } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/language-context'

export default function SubscribeButton({ priceKobo, renew = false }: { priceKobo: number; renew?: boolean }) {
  const { t } = useTranslation()
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const price = formatNaira(priceKobo)

  async function handleClick() {
    setError('')
    setPaying(true)
    try {
      const res = await fetch('/api/premium/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: isNativeApp() }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error || t('premium.pay_start_failed')); return }
      await openCheckout(data.authorization_url)   // web: redirect · app: system browser
    } catch {
      setError(t('wallet.network_error_retry'))
    } finally {
      setPaying(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <button
        onClick={handleClick}
        disabled={paying}
        style={{
          background: 'var(--color-brand)', color: 'white', border: 'none', borderRadius: 10,
          padding: '8px 16px', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13,
          cursor: paying ? 'not-allowed' : 'pointer', opacity: paying ? 0.6 : 1,
          display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        }}
      >
        {paying && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />}
        {paying ? t('premium.redirecting') : renew ? t('premium.cta_renew', { price }) : t('premium.cta_subscribe', { price })}
      </button>
      {error && <p style={{ fontSize: 12, color: 'var(--color-error)', margin: '6px 0 0', textAlign: 'right' }}>{error}</p>}
    </div>
  )
}
