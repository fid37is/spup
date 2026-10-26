// src/app/(main)/analytics/page.tsx
//
// Detailed creator analytics - a Spup Premium feature ("Deep analytics" on the
// landing page), open to everyone while the admin switch "Analytics free for everyone" is on
// (admin -> Features): performance over time (1 week to 1 year, line or bar), audience
// by age / state / active times, and what performs.
//
// Access is checked on the server inside getAnalyticsBundle(); without it this
// page renders the locked screen and none of the data is ever fetched.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Lock, Check } from 'lucide-react'
import { getAuthUser } from '@/lib/supabase/server'
import { getProfileByAuthId } from '@/lib/queries'
import { getPremiumPriceKobo } from '@/lib/premium'
import { getAnalyticsBundle } from '@/lib/analytics'
import { TZ_COOKIE, pickTimeZone } from '@/lib/timezone'
import SubscribeButton from '@/components/premium/subscribe-button'
import AnalyticsView from '@/components/analytics/analytics-view'

export const metadata = {
  title: 'Analytics - Spup',
  robots: { index: false, follow: false },
}

export default async function AnalyticsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const profile = await getProfileByAuthId(user.id)
  if (!profile) redirect('/login')

  // The creator's own time zone (set from their browser, see AnalyticsView); Nigeria time until then.
  const tz = pickTimeZone((await cookies()).get(TZ_COOKIE)?.value)
  const bundle = await getAnalyticsBundle(profile.id, tz)   // null = no access

  return (
    <div>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)', padding: '16px 20px',
      }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--color-text-primary)', margin: 0 }}>
          Analytics
        </h1>
      </div>

      <div style={{ padding: '16px 16px 40px', maxWidth: 720, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {bundle ? <AnalyticsView key={bundle.tz} bundle={bundle} /> : <Locked priceKobo={await getPremiumPriceKobo()} />}
      </div>
    </div>
  )
}

// ─── Locked (no active Premium) ──────────────────────────────────────────────

function Locked({ priceKobo }: { priceKobo: number }) {
  const perks = [
    'Charts of your reach and engagement, from 1 week to 1 year',
    'Audience by age, country and Nigerian state - where your viewers are',
    'Active times - the best day and hour to post',
    'Your top-performing posts and engagement rate',
  ]
  return (
    <div style={{ border: '1px solid rgba(212,160,23,0.3)', background: 'rgba(212,160,23,0.06)', borderRadius: 16, padding: '20px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Lock size={18} color="#D4A017" />
        <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17, color: 'var(--color-text-primary)' }}>
          Detailed analytics is a Premium feature
        </span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: '0 0 14px' }}>
        Know who your audience is and what performs. Subscribe to Spup Premium to unlock:
      </p>
      <ul style={{ margin: '0 0 18px', padding: 0, listStyle: 'none', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.9 }}>
        {perks.map(p => (
          <li key={p} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Check size={14} color="#1A9E5F" style={{ flexShrink: 0, marginTop: 4 }} /> <span>{p}</span>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/premium/learn" style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'underline' }}>
          How Premium works
        </Link>
        <SubscribeButton priceKobo={priceKobo} />
      </div>
    </div>
  )
}
