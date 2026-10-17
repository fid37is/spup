// src/components/analytics/analytics-view.tsx
'use client'

// The Premium analytics dashboard (client side): range pills, the overview chart
// with metric / chart-type / grouping controls, the numbers with change vs the
// previous period, the audience (age, states, active times) and top posts.
//
// All the time-series maths happens here from one set of daily rows, so changing
// range, metric or grouping is instant. Only the audience is fetched per range.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, ChevronDown, TrendingUp } from 'lucide-react'
import { formatNumber } from '@/lib/utils'
import { getAudienceAction } from '@/lib/actions/creator-analytics'
import { TZ_COOKIE, isValidTimeZone, tzLabel } from '@/lib/timezone'
import {
  ANALYTICS_RANGES, DEFAULT_RANGE, MIN_AUDIENCE_SAMPLE, RANGE_LABELS, RANGE_NAMES,
  type AnalyticsBundle, type AnalyticsRange, type Audience,
} from '@/lib/analytics-shared'
import {
  bucketize, countryFlag, countryName, defaultGranularity, dayLabel, dayLabelYear, granularityOptions, metricValue, pctChange, sumRows,
  type Granularity, type MetricKey,
} from '@/lib/analytics-math'
import { Donut, DAY_LONG, Heatmap, HBars, TimeChart, blockRange, toBlocks, type ChartSeries } from './charts'

const BRAND = '#1A9E5F'
const BLUE = '#378ADD'
const UP = '#00BA7C'
const DOWN = '#F4212E'
const AGE_COLORS = [BRAND, BLUE, '#D4A017', '#E0245E', '#8B5CF6']

const METRICS: { key: MetricKey; label: string; rate?: boolean }[] = [
  { key: 'impressions', label: 'Impressions' },
  { key: 'engagement', label: 'Engagement rate', rate: true },
  { key: 'likes', label: 'Likes' },
  { key: 'replies', label: 'Replies' },
  { key: 'reposts', label: 'Reposts' },
  { key: 'bookmarks', label: 'Bookmarks' },
  { key: 'follows', label: 'New follows' },
]
const metricOf = (k: MetricKey) => METRICS.find(m => m.key === k)!
const fmtRate = (n: number) => `${Number(n.toFixed(1))}%`
const fmtMetric = (k: MetricKey) => (n: number) => (metricOf(k).rate ? fmtRate(n) : formatNumber(Math.round(n)))

const GRAN_LABEL: Record<Granularity, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }

const card: React.CSSProperties = {
  border: '1px solid var(--color-border)', borderRadius: 16, padding: 16, marginBottom: 12, background: 'var(--color-surface)',
}
const cardTitle: React.CSSProperties = {
  fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 15, color: 'var(--color-text-primary)', margin: '0 0 4px',
}
const cardHint: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5, margin: '0 0 14px' }
const mutedNote: React.CSSProperties = { fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: 0 }

export default function AnalyticsView({ bundle }: { bundle: AnalyticsBundle }) {
  const { series, posts, tz } = bundle
  const router = useRouter()

  // Learn the creator's own time zone from their browser and remember it in a cookie,
  // so days and active times are on THEIR clock (Lagos, Accra, Amsterdam...). If it
  // differs from what the server used, reload the numbers once in the right zone.
  useEffect(() => {
    let browserTz: string | undefined
    try { browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { /* very old browser: keep the default */ }
    if (!browserTz || !isValidTimeZone(browserTz) || browserTz === tz) return
    try {
      if (sessionStorage.getItem('spup_tz_synced') === browserTz) return   // already tried this session: never loop
      sessionStorage.setItem('spup_tz_synced', browserTz)
    } catch { /* storage blocked: the cookie check below still limits it */ }
    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(browserTz)}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }, [tz, router])

  const [range, setRange] = useState<AnalyticsRange>(DEFAULT_RANGE)
  const [metric, setMetric] = useState<MetricKey>('impressions')
  const [secondary, setSecondary] = useState<MetricKey | ''>('')
  const [chartType, setChartType] = useState<'line' | 'bar'>('line')
  const [gran, setGran] = useState<Granularity>(defaultGranularity(DEFAULT_RANGE))

  // ── audience: the first range comes with the page, the others are fetched once each ──
  const [audiences, setAudiences] = useState<Record<number, Audience | null>>({ [DEFAULT_RANGE]: bundle.audience })
  const audienceLoading = !(range in audiences)
  useEffect(() => {
    if (range in audiences) return
    let cancelled = false
    getAudienceAction(range)
      .then(a => { if (!cancelled) setAudiences(prev => ({ ...prev, [range]: a })) })
      .catch(() => { if (!cancelled) setAudiences(prev => ({ ...prev, [range]: null })) })
    return () => { cancelled = true }
  }, [range, audiences])
  const audience = audiences[range] ?? null

  // ── time series for the chosen range ──
  const gransAllowed = granularityOptions(range)
  const effectiveGran: Granularity = gransAllowed.includes(gran) ? gran : 'daily'

  const cur = useMemo(() => series.slice(-range), [series, range])
  const prev = useMemo(() => series.slice(-2 * range, -range), [series, range])
  const curAgg = useMemo(() => sumRows(cur), [cur])
  const prevAgg = useMemo(() => sumRows(prev), [prev])
  const points = useMemo(() => bucketize(cur, effectiveGran, range >= 365), [cur, effectiveGran, range])

  const rangeStart = cur[0]?.d
  const rangeEnd = cur[cur.length - 1]?.d

  const chartSeries: ChartSeries[] = [
    {
      name: metricOf(metric).label, color: BRAND, values: points.map(p => metricValue(p.agg, metric)),
      format: fmtMetric(metric), integer: !metricOf(metric).rate,
    },
    ...(secondary ? [{
      name: metricOf(secondary).label, color: BLUE, values: points.map(p => metricValue(p.agg, secondary)),
      format: fmtMetric(secondary), integer: !metricOf(secondary).rate,
    }] : []),
  ]

  // ── cards ──
  const periodPosts = useMemo(() => {
    if (!rangeStart) return []
    return posts.filter(p => p.day >= rangeStart)
  }, [posts, rangeStart])
  const profileVisits = periodPosts.reduce((a, p) => a + p.profileVisits, 0)

  const topPosts = useMemo(() => (
    [...periodPosts]
      .map(p => ({ ...p, engagements: p.likes + p.comments + p.reposts + p.quotes + p.bookmarks }))
      .sort((a, b) => b.engagements - a.engagements || b.impressions - a.impressions)
      .slice(0, 5)
  ), [periodPosts])

  const cards: { key: MetricKey | 'profile'; label: string; value: string; delta: number | null | undefined }[] = [
    ...(['impressions', 'engagement'] as MetricKey[]).map(k => card3(k)),
    { key: 'profile', label: 'Profile visits', value: formatNumber(profileVisits), delta: undefined },
    card3('follows'),
    card3('replies'), card3('likes'), card3('reposts'), card3('bookmarks'),
  ]
  function card3(k: MetricKey) {
    const c = metricValue(curAgg, k)
    const p = metricValue(prevAgg, k)
    return { key: k, label: metricOf(k).label, value: fmtMetric(k)(c), delta: pctChange(c, p) }
  }

  function pickRange(r: AnalyticsRange) {
    setRange(r)
    setGran(defaultGranularity(r))
  }

  if (!bundle.seriesAvailable) {
    return (
      <div style={card}>
        <h2 style={cardTitle}>Analytics isn&apos;t ready yet</h2>
        <p style={mutedNote}>
          The numbers for this page couldn&apos;t be loaded. If you run Spup, apply database migration <code>059_creator_analytics_v2.sql</code> and refresh.
        </p>
      </div>
    )
  }

  const nothingYet = curAgg.impressions === 0 && curAgg.likes === 0 && curAgg.follows === 0 && curAgg.replies === 0

  return (
    <>
      {/* ── Range: one row, never wraps (scrolls sideways on the narrowest phones) ── */}
      <div
        role="tablist" aria-label="Time range"
        style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', flexWrap: 'nowrap', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {ANALYTICS_RANGES.map(r => {
          const on = r === range
          return (
            <button
              key={r} role="tab" aria-selected={on} aria-label={`Last ${RANGE_NAMES[r]}`} onClick={() => pickRange(r)}
              style={{
                flex: '1 0 auto', minWidth: 44, height: 36, padding: '0 14px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
                fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", WebkitTapHighlightColor: 'transparent',
                border: `1px solid ${on ? 'var(--color-text-primary)' : 'var(--color-border-light)'}`,
                background: on ? 'var(--color-text-primary)' : 'transparent',
                color: on ? 'var(--color-bg)' : 'var(--color-text-primary)',
              }}
            >{RANGE_LABELS[r]}</button>
          )
        })}
      </div>

      {/* ── Overview ── */}
      <div style={card}>
        <h2 style={{ ...cardTitle, fontSize: 17 }}>Account overview</h2>
        <p style={{ ...cardHint, marginBottom: 14 }}>
          {rangeStart && rangeEnd ? `${dayLabelYear(rangeStart)} - ${dayLabelYear(rangeEnd)}` : ''}
          {' · vs the previous '}{RANGE_NAMES[range]}
          {' · '}{tzLabel(tz)}
        </p>

        {/* controls: two tidy rows, nothing wraps */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, marginBottom: 8 }}>
          <Select
            label="Metric" value={metric}
            onChange={v => { setMetric(v as MetricKey); if (v === secondary) setSecondary('') }}
            options={METRICS.map(m => ({ value: m.key, label: m.label }))}
          />
          <Select
            label="Compare with" value={secondary} muted={!secondary}
            onChange={v => setSecondary(v as MetricKey | '')}
            options={[{ value: '', label: 'Add a metric' }, ...METRICS.filter(m => m.key !== metric).map(m => ({ value: m.key, label: m.label }))]}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, marginBottom: 14 }}>
          <div role="group" aria-label="Chart type" style={{ display: 'flex', border: '1px solid var(--color-border-light)', borderRadius: 12, padding: 3, gap: 3 }}>
            {([['line', 'Line', TrendingUp], ['bar', 'Bar', BarChart3]] as const).map(([val, text, Icon]) => {
              const on = chartType === val
              return (
                <button
                  key={val} aria-pressed={on} onClick={() => setChartType(val)}
                  style={{
                    flex: 1, minWidth: 0, height: 34, border: 'none', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", WebkitTapHighlightColor: 'transparent',
                    background: on ? 'var(--color-surface-3)' : 'transparent',
                    color: on ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  }}
                ><Icon size={15} />{text}</button>
              )
            })}
          </div>
          <Select
            label="Group by" value={effectiveGran} onChange={v => setGran(v as Granularity)}
            options={gransAllowed.map(g => ({ value: g, label: GRAN_LABEL[g] }))}
          />
        </div>

        {nothingYet && (
          <p style={{ ...mutedNote, marginBottom: 10 }}>
            Nothing in the last {RANGE_NAMES[range]} yet. Post something, or pick a longer range.
          </p>
        )}

        <TimeChart
          labels={points.map(p => p.label)}
          xLabels={points.map(p => p.short)}
          series={chartSeries}
          type={chartType}
          ariaLabel={`${chartSeries.map(s => s.name).join(' and ')}, ${GRAN_LABEL[effectiveGran].toLowerCase()}, last ${RANGE_NAMES[range]}`}
        />

        {secondary && (
          <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 12, color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
            {chartSeries.map(s => (
              <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />{s.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Numbers (tap one to chart it) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 10, marginBottom: 12 }}>
        {cards.map(c => {
          const chartable = c.key !== 'profile'
          const on = chartable && c.key === metric
          return (
            <button
              key={c.key} disabled={!chartable}
              onClick={() => { if (chartable) { setMetric(c.key as MetricKey); if (c.key === secondary) setSecondary('') } }}
              title={chartable ? `Show ${c.label.toLowerCase()} on the chart` : 'From posts you published in this period'}
              style={{
                textAlign: 'left', cursor: chartable ? 'pointer' : 'default', font: 'inherit', WebkitTapHighlightColor: 'transparent',
                border: `1px solid ${on ? BRAND : 'var(--color-border)'}`, borderRadius: 14, padding: '12px 14px', background: 'var(--color-surface)',
                minWidth: 0,
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'nowrap' }}>
                <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: 'var(--color-text-primary)', lineHeight: 1.1 }}>{c.value}</span>
                <Delta value={c.delta} />
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Audience ── */}
      <h2 style={{ ...cardTitle, fontSize: 17, margin: '20px 4px 10px' }}>Audience</h2>
      {audienceLoading ? (
        <div style={card}><p style={mutedNote}>Loading your audience for the last {RANGE_NAMES[range]}…</p></div>
      ) : !audience ? (
        <div style={card}><p style={mutedNote}>Audience insights aren&apos;t available right now. Please check back soon.</p></div>
      ) : (
        <AudienceSection audience={audience} rangeName={RANGE_NAMES[range]} tz={tz} />
      )}

      {/* ── Top posts ── */}
      <div style={card}>
        <h2 style={cardTitle}>What performs</h2>
        <p style={cardHint}>Your top posts published in the last {RANGE_NAMES[range]}, by engagement.</p>
        {topPosts.length === 0 ? (
          <p style={mutedNote}>You haven&apos;t posted in this period. Pick a longer range to see more.</p>
        ) : topPosts.map((p, i) => (
          <Link key={p.id} href={`/post/${p.id}`} style={{
            display: 'block', textDecoration: 'none', padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--color-border)',
          }}>
            <div style={{
              fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.45, marginBottom: 4,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere',
            }}>
              {p.body || 'Post with media'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
              {dayLabel(p.day)}
              {' · '}{formatNumber(p.impressions)} views · {formatNumber(p.likes)} likes · {formatNumber(p.comments)} replies · {formatNumber(p.reposts)} reposts
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}

// ─── Audience ────────────────────────────────────────────────────────────────

function AudienceSection({ audience, rangeName, tz }: { audience: Audience; rangeName: string; tz: string }) {
  const agesEnough = audience.ageSample >= MIN_AUDIENCE_SAMPLE
  const statesEnough = audience.stateSample >= MIN_AUDIENCE_SAMPLE
  const countriesEnough = audience.countrySample >= MIN_AUDIENCE_SAMPLE
  const abroadEnough = audience.abroadSample >= MIN_AUDIENCE_SAMPLE
  const abroadRows = audience.abroad.map(r => ({
    label: `${countryFlag(r.code) ? countryFlag(r.code) + '  ' : ''}${r.label}, ${countryName(r.code)}`,
    count: r.count,
  }))
  const abroadShown = audience.abroad.reduce((a, r) => a + r.count, 0)
  if (audience.abroadSample > abroadShown) abroadRows.push({ label: 'Other regions', count: audience.abroadSample - abroadShown })

  // top countries, plus one "Other countries" row for everything beyond the list
  const shown = audience.countries.reduce((a, c) => a + c.count, 0)
  const countryRows = [
    ...audience.countries.map(c => ({
      label: `${countryFlag(c.code) ? countryFlag(c.code) + '  ' : ''}${countryName(c.code)}`,
      count: c.count,
    })),
    ...(audience.countrySample > shown ? [{ label: 'Other countries', count: audience.countrySample - shown }] : []),
  ]

  const blocks = toBlocks(audience.heat)
  const totalViews = blocks.flat().reduce((a, b) => a + b, 0)
  const heatEnough = totalViews >= MIN_AUDIENCE_SAMPLE

  let peak = { dow: 0, b: 0, v: -1 }
  blocks.forEach((row, dow) => row.forEach((v, b) => { if (v > peak.v) peak = { dow, b, v } }))

  const topAge = [...audience.ages].sort((a, b) => b.count - a.count)[0]

  return (
    <>
      <div style={card}>
        <h2 style={cardTitle}>Age</h2>
        <p style={cardHint}>Age of people who viewed your posts in the last {rangeName} and have added a date of birth.</p>
        {!agesEnough ? (
          <p style={mutedNote}>Not enough data yet. This appears once at least {MIN_AUDIENCE_SAMPLE} viewers share their age.</p>
        ) : (
          <Donut
            slices={audience.ages.map((a, i) => ({ label: a.label, count: a.count, color: AGE_COLORS[i % AGE_COLORS.length] }))}
            centerTop={topAge ? `${Math.round((topAge.count / audience.ageSample) * 100)}%` : ''}
            centerBottom={topAge ? topAge.label : ''}
          />
        )}
      </div>

      <div style={card}>
        <h2 style={cardTitle}>Top countries</h2>
        <p style={cardHint}>Where the people who viewed your posts in the last {rangeName} are.</p>
        {!countriesEnough ? (
          <p style={mutedNote}>Not enough data yet. This appears once at least {MIN_AUDIENCE_SAMPLE} viewers have a known location.</p>
        ) : (
          <HBars items={countryRows} total={audience.countrySample} />
        )}
      </div>

      {/* Nigerian states: only when some viewers are in Nigeria */}
      {audience.stateSample > 0 && (
        <div style={card}>
          <h2 style={cardTitle}>Top states in Nigeria</h2>
          <p style={cardHint}>Where your Nigerian viewers are.</p>
          {!statesEnough ? (
            <p style={mutedNote}>Not enough data yet. This appears once at least {MIN_AUDIENCE_SAMPLE} Nigerian viewers share their state.</p>
          ) : (
            <HBars items={audience.states} total={audience.stateSample} />
          )}
        </div>
      )}

      {/* Regions of countries other than Nigeria (Ghana, the Netherlands, Kenya...) */}
      {audience.abroadSample > 0 && (
        <div style={card}>
          <h2 style={cardTitle}>Other countries</h2>
          <p style={cardHint}>Regions of your viewers who are outside Nigeria.</p>
          {!abroadEnough ? (
            <p style={mutedNote}>Not enough data yet. This appears once at least {MIN_AUDIENCE_SAMPLE} viewers outside Nigeria share their region.</p>
          ) : (
            <HBars items={abroadRows} total={audience.abroadSample} />
          )}
        </div>
      )}

      <div style={card}>
        <h2 style={cardTitle}>Active times</h2>
        <p style={cardHint}>When people view your posts, by day and time, on your clock: {tzLabel(tz)}.</p>
        {!heatEnough ? (
          <p style={mutedNote}>Not enough views yet to show a pattern.</p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--color-text-primary)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Busiest on <strong>{DAY_LONG[peak.dow]}</strong>, {blockRange(peak.b)}. A good time to post is just before.
            </p>
            <Heatmap blocks={blocks} />
          </>
        )}
      </div>

      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.5, margin: '2px 4px 16px' }}>
        Audience numbers are anonymous counts from {formatNumber(audience.viewers)} viewers. Spup never shows you who they are.
      </p>
    </>
  )
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function Delta({ value }: { value: number | null | undefined }) {
  if (value === undefined) return null
  if (value === null) return <span style={{ fontSize: 12, fontWeight: 700, color: UP, whiteSpace: 'nowrap' }}>New</span>
  const rounded = Math.round(Math.abs(value) * 10) / 10
  if (rounded === 0) {
    return <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}><ArrowRight size={12} />0%</span>
  }
  const up = value > 0
  const text = rounded >= 1000 ? `${Math.round(rounded / 100) / 10}K` : String(rounded)
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: up ? UP : DOWN, display: 'inline-flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}>
      {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{text}%
    </span>
  )
}

/** A native <select> dressed as a pill: opens the phone's own picker, never overflows, never wraps. */
function Select({ label, value, onChange, options, muted = false }: {
  label: string; value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]; muted?: boolean
}) {
  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <select
        aria-label={label} value={value} onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', height: 40, appearance: 'none', WebkitAppearance: 'none',
          background: 'transparent', border: '1px solid var(--color-border-light)', borderRadius: 12,
          padding: '0 32px 0 12px', fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
          color: muted ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', outline: 'none',
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value} style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-primary)' }}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={16} aria-hidden style={{ position: 'absolute', right: 10, top: 12, pointerEvents: 'none', color: 'var(--color-text-muted)' }} />
    </div>
  )
}
