// src/lib/analytics-shared.ts
//
// Types and constants for the Premium /analytics page that both the server
// (src/lib/analytics.ts) and the client (components/analytics/*) need.
// No server-only imports here, so it is safe in client components.

/** Ranges the page offers, in days: 1W, 2W, 4W, 3M, 6M, 1Y. */
export const ANALYTICS_RANGES = [7, 14, 28, 90, 180, 365] as const
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number]
export const DEFAULT_RANGE: AnalyticsRange = 28

export const RANGE_LABELS: Record<AnalyticsRange, string> = {
  7: '1W', 14: '2W', 28: '4W', 90: '3M', 180: '6M', 365: '1Y',
}
export const RANGE_NAMES: Record<AnalyticsRange, string> = {
  7: '1 week', 14: '2 weeks', 28: '4 weeks', 90: '3 months', 180: '6 months', 365: '1 year',
}

/** Days of daily history fetched in one go (2 x the longest range, for the "vs previous period" numbers). */
export const SERIES_DAYS = 730

/** A breakdown is only shown when at least this many viewers sit behind it. */
export const MIN_AUDIENCE_SAMPLE = 5

/** One day (Africa/Lagos) of activity on the creator's posts. */
export interface DayRow {
  d: string            // 'YYYY-MM-DD'
  impressions: number
  likes: number
  replies: number
  reposts: number
  quotes: number
  bookmarks: number
  follows: number
}

export interface Bucket { label: string; count: number }

export interface CountryBucket { code: string; count: number }

/** A region of a country other than Nigeria, e.g. Greater Accra in Ghana. */
export interface AbroadRegion { code: string; label: string; count: number }

export interface Audience {
  viewers: number
  /** top countries of viewers, ISO codes (any country that has signed up appears here) */
  countries: CountryBucket[]
  /** viewers whose country is known: the 100% for `countries` */
  countrySample: number
  /** top regions of viewers OUTSIDE Nigeria */
  abroad: AbroadRegion[]
  /** viewers outside Nigeria whose region is known: the 100% for `abroad` */
  abroadSample: number
  /** states of the viewers who are in Nigeria */
  states: Bucket[]
  stateSample: number
  ages: Bucket[]
  ageSample: number
  /** heat[dow][hour]: views by weekday (0 = Sunday) and hour of day, Nigeria time */
  heat: number[][]
}

export interface PostStat {
  id: string
  body: string
  createdAt: string
  /** the day it was posted, on the creator's calendar ('YYYY-MM-DD') */
  day: string
  impressions: number
  likes: number
  comments: number
  reposts: number
  quotes: number
  bookmarks: number
  profileVisits: number
}

export interface AnalyticsBundle {
  /** the time zone all days and times in this bundle are in (the creator's own) */
  tz: string
  /** Oldest first, one row per day, ending today. Empty if migration 059 isn't applied. */
  series: DayRow[]
  seriesAvailable: boolean
  posts: PostStat[]
  /** Audience for DEFAULT_RANGE; other ranges are fetched on demand. null = unavailable. */
  audience: Audience | null
}
