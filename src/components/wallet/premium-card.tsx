'use client'

// src/components/wallet/premium-card.tsx
//
// The ONE place Spup Premium is sold and managed. (There used to be a second,
// dark /premium page; /premium now just redirects here.)
//
//  - Subscribed            -> one green status line "Premium active until ...".
//                             The Renew button only appears in the last 7 days
//                             (renewing early stacks 30 more days after the
//                             current period, so nothing is lost).
//  - Not subscribed        -> the pitch card: benefits, "How Premium works"
//    (never / lapsed)         (/premium/learn) and a Subscribe button that goes
//                             straight to Paystack.
//  - Lapsed + was earning  -> "ad earnings paused, renew" instead of the pitch.
//
// Other pages link to /wallet#premium, which lands on this card.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Crown, Check, CheckCircle, AlertCircle } from 'lucide-react'
import SubscribeButton from '@/components/premium/subscribe-button'
import { useTranslation } from '@/lib/i18n/language-context'

const RENEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

interface Props {
  active: boolean
  premiumUntil: string | null     // ISO; in the past = lapsed
  priceKobo: number
  isMonetised: boolean
  needsVerification: boolean
}

export default function PremiumCard({ active, premiumUntil, priceKobo, isMonetised, needsVerification }: Props) {
  const { t } = useTranslation()
  const [banner, setBanner] = useState<'' | 'ok' | 'failed'>('')
  const [renewSoon, setRenewSoon] = useState(false)

  // Paystack sends people back to /wallet?premium=1 (or =failed). Show the result
  // once, then tidy the URL.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('premium')
    if (p === '1') setBanner('ok')
    if (p === 'failed') setBanner('failed')
    if (p) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  // Computed after mount so the server and browser render the same HTML.
  useEffect(() => {
    setRenewSoon(active && !!premiumUntil && new Date(premiumUntil).getTime() - Date.now() < RENEW_WINDOW_MS)
  }, [active, premiumUntil])

  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const lapsed = !active && !!premiumUntil

  const bannerEl = banner && (
    <div style={{
      display: 'flex', gap: 10, borderRadius: 12, padding: '12px 14px', marginBottom: 12, fontSize: 13, lineHeight: 1.5,
      background: banner === 'ok' ? 'rgba(26,158,95,0.08)' : 'rgba(229,57,53,0.08)',
      border: `1px solid ${banner === 'ok' ? 'rgba(26,158,95,0.2)' : 'rgba(229,57,53,0.2)'}`,
      color: banner === 'ok' ? '#1A9E5F' : '#E57373',
    }}>
      {banner === 'ok' ? <CheckCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />}
      <span>{banner === 'ok' ? t('premium.paid_banner') : t('premium.paid_failed')}</span>
    </div>
  )

  const pitch = (
    <div style={{ border: '1px solid rgba(212,160,23,0.3)', background: 'rgba(212,160,23,0.06)', borderRadius: 14, padding: '16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Crown size={18} color="#D4A017" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
            {t('premium.gate_title')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.55, marginBottom: 10 }}>
            {lapsed && premiumUntil ? `${t('premium.gate_lapsed', { date: fmt(premiumUntil) })} ` : ''}{t('premium.gate_desc')}
          </div>
          <ul style={{ margin: '0 0 14px', padding: 0, listStyle: 'none', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.9 }}>
            {['premium.benefit_verify', 'premium.benefit_permanent', 'premium.benefit_earn', 'premium.benefit_withdraw'].map(k => (
              <li key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Check size={14} color="#1A9E5F" style={{ flexShrink: 0, marginTop: 4 }} /> <span>{t(k)}</span>
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Link href="/premium/learn" style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'underline' }}>
              {t('premium.how_it_works')}
            </Link>
            <SubscribeButton priceKobo={priceKobo} />
          </div>
        </div>
      </div>
    </div>
  )

  let body: React.ReactNode
  if (active && premiumUntil) {
    // Subscribed: a quiet status line (+ Renew only when it's about to run out).
    body = (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        border: '1px solid rgba(26,158,95,0.3)', background: 'rgba(26,158,95,0.06)',
        borderRadius: 14, padding: '12px 14px', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Crown size={18} color="#1A9E5F" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{t('premium.card_active', { date: fmt(premiumUntil) })}</span>
        </div>
        {renewSoon && <SubscribeButton priceKobo={priceKobo} renew />}
      </div>
    )
  } else if (needsVerification) {
    body = pitch
  } else if (isMonetised) {
    // Only people who actually opted into earning get told earnings are paused.
    body = (
      <div style={{ border: '1px solid rgba(212,160,23,0.3)', background: 'rgba(212,160,23,0.06)', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text-primary)', marginBottom: 10, lineHeight: 1.5 }}>{t('premium.card_paused')}</div>
        <SubscribeButton priceKobo={priceKobo} renew />
      </div>
    )
  } else {
    // Not subscribed, nothing to verify, not earning yet: still needs a way to
    // subscribe (the "Spup Premium - Subscribe" links all point here).
    body = pitch
  }

  return (
    <div id="premium" style={{ scrollMarginTop: 80 }}>
      {bannerEl}
      {body}
    </div>
  )
}