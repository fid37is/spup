// src/app/(main)/premium/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Crown, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { getPremiumStatusAction, type PremiumStatus } from '@/lib/actions/premium'
import SubscribeButton from '@/components/premium/subscribe-button'
import { formatNaira } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/language-context'

export default function PremiumPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<PremiumStatus | null>(null)
  const [banner, setBanner] = useState<'' | 'ok' | 'failed'>('')

  useEffect(() => {
    const paid = new URLSearchParams(window.location.search).get('paid')
    if (paid === '1') setBanner('ok')
    if (paid === 'failed') setBanner('failed')
    if (paid) window.history.replaceState(null, '', window.location.pathname)
    getPremiumStatusAction().then(setStatus)
  }, [])

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

  if (!status) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '28px 20px', display: 'flex', gap: 10, alignItems: 'center', color: '#6A6A60', fontSize: 14 }}>
        <Loader2 size={16} style={{ animation: 'kyc-spin 1s linear infinite' }} /> {t('premium.checking')}
        <style>{`@keyframes kyc-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }
  if ('error' in status) {
    return <div style={{ maxWidth: 480, margin: '0 auto', padding: '28px 20px', color: '#E57373', fontSize: 14 }}>{status.error}</div>
  }

  const price = formatNaira(status.price_kobo)
  const lapsed = !status.active && !!status.premium_until
  const nextVerify = !status.phone_verified ? '/settings/verify-phone' : !status.nin_verified ? '/settings/verify-nin' : null

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '28px 20px', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(212,160,23,0.1)', border: '1px solid rgba(212,160,23,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Crown size={22} color="#D4A017" />
        </div>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: '#F0F0EC', letterSpacing: '-0.02em', margin: 0 }}>{t('premium.title')}</h1>
          <p style={{ fontSize: 13, color: '#6A6A60', margin: 0 }}>{t('premium.tagline')}</p>
        </div>
      </div>

      {banner === 'ok' && (
        <div style={{ display: 'flex', gap: 10, background: 'rgba(26,158,95,0.08)', border: '1px solid rgba(26,158,95,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: '#1A9E5F' }}>
          <CheckCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} /> {t('premium.paid_banner')}
        </div>
      )}
      {banner === 'failed' && (
        <div style={{ display: 'flex', gap: 10, background: 'rgba(229,57,53,0.08)', border: '1px solid rgba(229,57,53,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: '#E57373' }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} /> {t('premium.paid_failed')}
        </div>
      )}
      <div style={{ background: '#131318', border: '1px solid #1E1E26', borderRadius: 12, padding: '18px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, marginBottom: 6, color: status.active ? '#1A9E5F' : lapsed ? '#E5A23C' : '#8A8A85' }}>
          {status.active
            ? t('premium.status_active', { date: fmtDate(status.premium_until!) })
            : lapsed
              ? t('premium.status_lapsed', { date: fmtDate(status.premium_until!) })
              : t('premium.status_none')}
        </div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 30, color: '#F0F0EC', marginBottom: 14 }}>
          {t('premium.price_line', { price })}
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#8A8A85', lineHeight: 1.8 }}>
          <li>{t('premium.benefit_earn')}</li>
          <li>{t('premium.benefit_verify')}</li>
          <li>{t('premium.benefit_permanent')}</li>
          <li>{t('premium.benefit_withdraw')}</li>
        </ul>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Link href="/premium/learn" style={{ fontSize: 13, color: '#8A8A85', textDecoration: 'underline' }}>{t('premium.how_it_works')}</Link>
        <SubscribeButton priceKobo={status.price_kobo} renew={status.active} />
      </div>
      {status.active && <p style={{ fontSize: 12, color: '#44444A', marginTop: 8, textAlign: 'right' }}>{t('premium.renew_note')}</p>}

      {status.active && nextVerify && (
        <Link href={nextVerify} style={{ display: 'block', textAlign: 'right', marginTop: 20, fontSize: 14, color: '#1A9E5F', fontWeight: 600, textDecoration: 'none' }}>
          {!status.phone_verified ? t('premium.next_verify_phone') : t('premium.next_verify_nin')} →
        </Link>
      )}
    </div>
  )
}
