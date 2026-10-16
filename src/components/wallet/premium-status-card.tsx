'use client'

// Compact Premium status for the wallet page. Ad earnings only accrue while
// Premium is active, so creators need to see why earnings stopped if it lapsed.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Crown } from 'lucide-react'
import { getPremiumStatusAction, type PremiumStatus } from '@/lib/actions/premium'
import { useTranslation } from '@/lib/i18n/language-context'

export default function PremiumStatusCard() {
  const { t } = useTranslation()
  const [s, setS] = useState<PremiumStatus | null>(null)
  useEffect(() => { getPremiumStatusAction().then(setS) }, [])
  if (!s || 'error' in s) return null

  const date = s.premium_until ? new Date(s.premium_until).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  return (
    <Link href="/premium" style={{
      display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
      border: `1px solid ${s.active ? 'rgba(26,158,95,0.3)' : 'rgba(212,160,23,0.3)'}`,
      background: s.active ? 'rgba(26,158,95,0.06)' : 'rgba(212,160,23,0.06)',
      borderRadius: 14, padding: '12px 14px', marginBottom: 12,
    }}>
      <Crown size={18} color={s.active ? '#1A9E5F' : '#D4A017'} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
        {s.active ? t('premium.card_active', { date }) : t('premium.card_inactive')}
      </span>
    </Link>
  )
}
