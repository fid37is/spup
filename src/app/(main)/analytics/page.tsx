// src/app/(main)/analytics/page.tsx
//
// Detailed creator analytics - a Spup Premium feature ("Deep analytics" on the
// landing page: audience by state, age and active hours, and what performs).
//
// Premium is checked on the server inside getCreatorAnalytics(); without it this
// page renders the locked screen and none of the data is ever fetched.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarChart3, Crown, Check, Lock } from 'lucide-react'
import { getAuthUser } from '@/lib/supabase/server'
import { getProfileByAuthId } from '@/lib/queries'
import { getPremiumPriceKobo } from '@/lib/premium'
import {
  getCreatorAnalytics, ANALYTICS_RANGES, DEFAULT_RANGE, MIN_AUDIENCE_SAMPLE,
  type AnalyticsRange, type Bucket, type CreatorAnalytics,
} from '@/lib/analytics'
import SubscribeButton from '@/components/premium/subscribe-button'
import { formatNumber } from '@/lib/utils'

export const metadata = {
  title: 'Analytics - Spup',
  robots: { index: false, follow: false },
}

const card: React.CSSProperties = {
  border: '1px solid var(--color-border)', borderRadius: 16, padding: '16px', marginBottom: 12,
}
const cardTitle: React.CSSProperties = {
  fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15, color: 'var(--color-text-primary)', margin: '0 0 4px',
}
const cardHint: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5, margin: '0 0 14px' }

function hourLabel(h: number) {
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const profile = await getProfileByAuthId(user.id)
  if (!profile) redirect('/login')

  const { range } = await searchParams
  const requested = Number(range)
  const days = (ANALYTICS_RANGES as readonly number[]).includes(requested) ? (requested as AnalyticsRange) : DEFAULT_RANGE

  const data = await getCreatorAnalytics(profile.id, days)   // null = no active Premium

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

      <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
        {data ? <Dashboard data={data} /> : <Locked priceKobo={await getPremiumPriceKobo()} />}
      </div>
    </div>
  )
}

// ─── Locked (no active Premium) ──────────────────────────────────────────────

function Locked({ priceKobo }: { priceKobo: number }) {
  const perks = [
    'Audience by state - where your viewers are in Nigeria',
    'Audience by age',
    'Active hours - the best time to post',
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Link href="/premium/learn" style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'underline' }}>
          How Premium works
        </Link>
        <SubscribeButton priceKobo={priceKobo} />
      </div>
    </div>
  )
}

// ─── Dashboard (Premium) ─────────────────────────────────────────────────────

function Dashboard({ data }: { data: CreatorAnalytics }) {
  const { totals: t, audience } = data
  const nothingYet = t.posts === 0

  return (
    <>
      {/* Range */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <BarChart3 size={16} color="var(--color-brand)" />
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)', marginRight: 'auto' }}>Posts from the last</span>
        {ANALYTICS_RANGES.map(r => (
          <Link key={r} href={`/analytics?range=${r}`} replace style={{
            fontSize: 13, fontWeight: 600, textDecoration: 'none', padding: '6px 12px', borderRadius: 999,
            border: '1px solid var(--color-border)',
            background: r === data.days ? 'var(--color-brand)' : 'transparent',
            color: r === data.days ? 'white' : 'var(--color-text-secondary)',
          }}>{r} days</Link>
        ))}
      </div>

      {nothingYet && (
        <div style={{ ...card, fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          You haven&apos;t posted in the last {data.days} days. Post something, or pick a longer range, and your numbers will show up here.
        </div>
      )}

      {/* Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 12 }}>
        <Stat label="Impressions" value={formatNumber(t.impressions)} />
        <Stat label="Engagement rate" value={`${t.engagementRate}%`} />
        <Stat label="Likes" value={formatNumber(t.likes)} />
        <Stat label="Comments" value={formatNumber(t.comments)} />
        <Stat label="Reposts" value={formatNumber(t.reposts)} />
        <Stat label="Saves" value={formatNumber(t.bookmarks)} />
        <Stat label="Profile visits" value={formatNumber(t.profileVisits)} />
        <Stat label="New followers" value={formatNumber(t.newFollowers)} />
      </div>

      {/* Top posts */}
      <div style={card}>
        <h2 style={cardTitle}>What performs</h2>
        <p style={cardHint}>Your top posts by engagement.</p>
        {data.topPosts.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>No posts in this range yet.</p>
        ) : data.topPosts.map((p, i) => (
          <Link key={p.id} href={`/post/${p.id}`} style={{
            display: 'block', textDecoration: 'none', padding: '10px 0',
            borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
          }}>
            <div style={{ fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.45, marginBottom: 4,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {p.body ? p.body.slice(0, 160) : 'Post with media'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {new Date(p.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })}
              {' · '}{formatNumber(p.impressions)} views · {formatNumber(p.likes)} likes · {formatNumber(p.comments)} comments · {formatNumber(p.reposts)} reposts
            </div>
          </Link>
        ))}
      </div>

      {/* Audience */}
      {audience ? (
        <>
          <ActiveHours hours={audience.activeHours} />
          <Breakdown
            title="Audience by state"
            hint="Where the people who viewed your posts are, in Nigeria."
            items={audience.states}
            sample={audience.stateSample}
          />
          <Breakdown
            title="Audience by age"
            hint="Age bands of viewers who have added their date of birth."
            items={audience.ages}
            sample={audience.ageSample}
          />
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.5, margin: '4px 4px 24px' }}>
            Audience numbers are anonymous counts from {formatNumber(audience.viewers)} viewers of your posts. Spup never shows you who they are.
          </p>
        </>
      ) : (
        <div style={{ ...card, fontSize: 13, color: 'var(--color-text-muted)' }}>
          Audience insights aren&apos;t available right now. Please check back soon.
        </div>
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 14, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: 'var(--color-text-primary)' }}>{value}</div>
    </div>
  )
}

function ActiveHours({ hours }: { hours: number[] }) {
  const max = Math.max(...hours)
  const total = hours.reduce((a, b) => a + b, 0)
  const enough = total >= MIN_AUDIENCE_SAMPLE
  const peak = hours.indexOf(max)

  return (
    <div style={card}>
      <h2 style={cardTitle}>Active hours</h2>
      <p style={cardHint}>When people first view your posts, by hour of the day (Nigeria time).</p>
      {!enough ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>Not enough views yet to show a pattern.</p>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--color-text-primary)', marginBottom: 12 }}>
            Busiest around <strong>{hourLabel(peak)}</strong>. A good time to post is just before.
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90 }}>
            {hours.map((c, h) => (
              <div key={h} title={`${hourLabel(h)}: ${c} views`} style={{
                flex: 1, minWidth: 0, borderRadius: 3,
                height: `${Math.max(4, Math.round((c / max) * 100))}%`,
                background: h === peak ? 'var(--color-brand)' : 'var(--color-border)',
              }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
            <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
          </div>
        </>
      )}
    </div>
  )
}

function Breakdown({ title, hint, items, sample }: { title: string; hint: string; items: Bucket[]; sample: number }) {
  const enough = sample >= MIN_AUDIENCE_SAMPLE
  return (
    <div style={card}>
      <h2 style={cardTitle}>{title}</h2>
      <p style={cardHint}>{hint}</p>
      {!enough ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
          Not enough data yet. This appears once at least {MIN_AUDIENCE_SAMPLE} of your viewers share this.
        </p>
      ) : items.map(b => {
        const pct = Math.round((b.count / sample) * 100)
        return (
          <div key={b.label} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: 'var(--color-text-primary)' }}>{b.label}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>{pct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--color-border)' }}>
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: 'var(--color-brand)' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}