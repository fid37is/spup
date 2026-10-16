'use client'

// src/components/wallet/premium-card.tsx
//
// Sits in the wallet where the "verify phone" banner used to be.
//  - Not subscribed + still needs verification -> explains Premium and offers
//    a small right-aligned Subscribe button that goes straight to payment, and a
//    "How Premium works" link to the full explainer (/premium/learn).
//  - Subscribed -> small "active until" line.
//  - Opted into monetisation but Premium lapsed -> "ad earnings paused, renew".
//  - Everyone else (never earned, nothing to verify) -> nothing at all.

import Link from 'next/link'
import { Crown, Check } from 'lucide-react'
import SubscribeButton from '@/components/premium/subscribe-button'
import { formatNaira } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/language-context'

interface Props {
  active: boolean
  premiumUntil: string | null     // ISO; in the past = lapsed
  priceKobo: number
  isMonetised: boolean
  needsVerification: boolean
}

export default function PremiumCard({ active, premiumUntil, priceKobo, isMonetised, needsVerification }: Props) {
  const { t } = useTranslation()
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const price = formatNaira(priceKobo)
  const lapsed = !active && !!premiumUntil

  // Subscribed: just a quiet status line.
  if (active && premiumUntil) {
    return (
      <Link href="/premium" style={{
        display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
        border: '1px solid rgba(26,158,95,0.3)', background: 'rgba(26,158,95,0.06)',
        borderRadius: 14, padding: '12px 14px', marginBottom: 12,
      }}>
        <Crown size={18} color="#1A9E5F" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{t('premium.card_active', { date: fmt(premiumUntil) })}</span>
      </Link>
    )
  }

  // Not subscribed and verification is still needed: explain + subscribe,
  // right where the verify-phone banner used to be.
  if (needsVerification) {
    return (
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
  }

  // Only people who actually opted into earning get told earnings are paused.
  if (isMonetised) {
    return (
      <div style={{ border: '1px solid rgba(212,160,23,0.3)', background: 'rgba(212,160,23,0.06)', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text-primary)', marginBottom: 10, lineHeight: 1.5 }}>{t('premium.card_paused')}</div>
        <SubscribeButton priceKobo={priceKobo} renew />
      </div>
    )
  }

  return null
}
