// src/lib/analytics-math.ts
//
// Pure helpers behind the analytics charts: bucketing days into weeks/months,
// comparing a period with the one before it, and picking tidy axis numbers.
// No React, no server code, so it is easy to test.

import type { DayRow } from './analytics-shared'

export type Granularity = 'daily' | 'weekly' | 'monthly'

export type MetricKey =
  | 'impressions' | 'engagement' | 'likes' | 'replies' | 'reposts' | 'bookmarks' | 'follows'

export interface Agg {
  impressions: number
  likes: number
  replies: number
  reposts: number
  quotes: number
  bookmarks: number
  follows: number
}

export const zeroAgg = (): Agg => ({
  impressions: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, bookmarks: 0, follows: 0,
})

export function addRow(a: Agg, r: DayRow): Agg {
  a.impressions += r.impressions
  a.likes += r.likes
  a.replies += r.replies
  a.reposts += r.reposts
  a.quotes += r.quotes
  a.bookmarks += r.bookmarks
  a.follows += r.follows
  return a
}

export function sumRows(rows: DayRow[]): Agg {
  const a = zeroAgg()
  for (const r of rows) addRow(a, r)
  return a
}

/** Likes + replies + reposts + quotes + bookmarks. */
export const engagementsOf = (a: Agg) => a.likes + a.replies + a.reposts + a.quotes + a.bookmarks

/** The number a metric shows for a bucket or a whole period. Engagement is a rate in %. */
export function metricValue(a: Agg, key: MetricKey): number {
  switch (key) {
    case 'engagement': return a.impressions > 0 ? (engagementsOf(a) / a.impressions) * 100 : 0
    case 'impressions': return a.impressions
    case 'likes': return a.likes
    case 'replies': return a.replies
    case 'reposts': return a.reposts
    case 'bookmarks': return a.bookmarks
    case 'follows': return a.follows
  }
}

/** % change from `prev` to `cur`. null = there was nothing before (shown as "New"). */
export function pctChange(cur: number, prev: number): number | null {
  if (prev > 0) return ((cur - prev) / prev) * 100
  return cur > 0 ? null : 0
}

// ─── Dates ('YYYY-MM-DD', no time zones involved) ───────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function parts(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return { y, m, day }
}
export const dayLabel = (d: string) => { const p = parts(d); return `${MONTHS[p.m - 1]} ${p.day}` }
export const dayLabelYear = (d: string) => { const p = parts(d); return `${MONTHS[p.m - 1]} ${p.day}, ${p.y}` }

export interface Point {
  /** Full label for the tooltip, e.g. "Jul 21 - Jul 27" */
  label: string
  /** Short label for the x axis, e.g. "Jul 21" */
  short: string
  agg: Agg
}

/**
 * Group days into points. `rows` must be oldest first.
 *  - daily:   one point per day
 *  - weekly:  7-day blocks counted back from the LAST day, so the newest block is always a full week
 *  - monthly: one point per calendar month (the first and last can be partial)
 */
export function bucketize(rows: DayRow[], gran: Granularity, spanYears = false): Point[] {
  if (rows.length === 0) return []

  if (gran === 'daily') {
    return rows.map(r => ({
      label: dayLabelYear(r.d), short: dayLabel(r.d), agg: addRow(zeroAgg(), r),
    }))
  }

  if (gran === 'weekly') {
    const out: Point[] = []
    for (let end = rows.length; end > 0; end -= 7) {
      const chunk = rows.slice(Math.max(0, end - 7), end)
      const first = chunk[0].d
      const last = chunk[chunk.length - 1].d
      out.unshift({ label: `${dayLabel(first)} - ${dayLabel(last)}`, short: dayLabel(first), agg: sumRows(chunk) })
    }
    return out
  }

  const out: Point[] = []
  let key = ''
  for (const r of rows) {
    const p = parts(r.d)
    const k = `${p.y}-${p.m}`
    if (k !== key) {
      key = k
      out.push({
        label: `${MONTHS_FULL[p.m - 1]} ${p.y}`,
        short: spanYears ? `${MONTHS[p.m - 1]} '${String(p.y).slice(2)}` : MONTHS[p.m - 1],
        agg: zeroAgg(),
      })
    }
    addRow(out[out.length - 1].agg, r)
  }
  return out
}

/** Which groupings make sense for a range of `days`. */
export function granularityOptions(days: number): Granularity[] {
  const out: Granularity[] = ['daily']
  if (days >= 14) out.push('weekly')
  if (days >= 90) out.push('monthly')
  return out
}

export const defaultGranularity = (days: number): Granularity => (days >= 180 ? 'weekly' : 'daily')

// ─── Axis ──────────────────────────────────────────────────────────────────

/** A tidy axis maximum and step for data that goes up to `max`, with `ticks` intervals. */
export function niceScale(max: number, ticks = 4, integer = false): { max: number; step: number } {
  if (!(max > 0)) return { max: ticks, step: 1 }
  const raw = max / ticks
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  if (integer) step = Math.max(1, Math.ceil(step))
  return { max: step * ticks, step }
}

const trim = (n: number, d = 1) => String(Number(n.toFixed(d)))

/** Short number for chart axes: 950, 1.2K, 12K, 3.4M. */
export function compact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000_000) return `${trim(n / 1_000_000_000)}B`
  if (a >= 1_000_000) return `${trim(n / 1_000_000)}M`
  if (a >= 10_000) return `${trim(n / 1_000, 0)}K`
  if (a >= 1_000) return `${trim(n / 1_000)}K`
  return trim(n, Number.isInteger(n) ? 0 : 1)
}

// ─── Countries ─────────────────────────────────────────────────────────────

/** "NG" -> "Nigeria", "GH" -> "Ghana", "NL" -> "Netherlands". Falls back to the code. */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/** "NG" -> the Nigerian flag emoji. Empty for anything that isn't a 2-letter code. */
export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return ''
  return String.fromCodePoint(...[...code].map(c => 127397 + c.charCodeAt(0)))
}
