// src/lib/analytics.ts
//
// Data for the /analytics page. Server only. Premium-only, unless an admin has switched on
// "Analytics free for everyone" (lib/feature-flags.ts, admin -> Features).
//
// getAnalyticsBundle() and getAudience() check access THEMSELVES (hasAnalyticsAccess: the free-for-all
// switch, else Spup Premium) and return null when there is none, so there is no way to get this data by calling them
// from another page without Premium. Everything is the creator's own data and is
// aggregated: the numbers are counts, never a list of who viewed or liked.
//
// The page loads two years of DAILY numbers once (small: 730 rows) and the
// browser slices them into any range / weekly / monthly view, so switching
// range or metric is instant. Only the audience breakdown depends on the range
// and is fetched per range (see lib/actions/creator-analytics.ts).

import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { hasAnalyticsAccess } from '@/lib/feature-flags'
import {
  DEFAULT_RANGE, SERIES_DAYS,
  type Audience, type AnalyticsBundle, type AnalyticsRange, type DayRow, type PostStat,
} from '@/lib/analytics-shared'
import { DEFAULT_TZ, localDay } from '@/lib/timezone'

/** How long finished numbers are reused before the heavy queries run again. */
const CACHE_SECONDS = 10 * 60

const AGE_ORDER = ['Under 18', '18-24', '25-34', '35-44', '45+']
const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

type Admin = ReturnType<typeof createAdminClient>

// ── Short-lived cache (table analytics_cache, migration 061) ─────────────────
// The series query counts up to two years of views and likes; for a creator with a
// big audience that is heavy, and people reopen this page often. So finished
// results are kept for CACHE_SECONDS. Works on any host (it is just a table), and
// if the table isn't there it quietly computes every time, as before.
// Access is always checked BEFORE this, on every request - the cache never
// decides who may see the numbers, only how fast they arrive.
async function cached<T>(admin: Admin, key: string, compute: () => Promise<T | null>): Promise<T | null> {
  let stale: T | null = null
  try {
    const { data } = await admin.from('analytics_cache').select('payload, computed_at').eq('cache_key', key).maybeSingle()
    if (data?.payload) {
      const age = Date.now() - new Date(data.computed_at as string).getTime()
      if (age < CACHE_SECONDS * 1000) return data.payload as T
      if (age < 24 * 60 * 60 * 1000) stale = data.payload as T   // only a day-old answer is worth falling back to
    }
  } catch { /* no cache table: just compute */ }

  const fresh = await compute()
  if (fresh === null) return stale            // compute failed: an old answer beats an error page
  try {
    await admin.from('analytics_cache').upsert({ cache_key: key, payload: fresh as unknown as object, computed_at: new Date().toISOString() })
  } catch { /* cache is best-effort */ }
  return fresh
}

async function fetchAudience(admin: Admin, userId: string, days: number, tz: string): Promise<Audience | null> {
  return cached(admin, `audience:${userId}:${days}:${tz}`, () => queryAudience(admin, userId, days, tz))
}

async function queryAudience(admin: Admin, userId: string, days: number, tz: string): Promise<Audience | null> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await admin.rpc('creator_audience_stats', { p_user_id: userId, p_since: since, p_tz: tz })
  if (error) {
    console.error('[analytics] creator_audience_stats failed (are migrations 058/059 applied?):', error.message)
    return null
  }
  if (!data) return null

  const d = data as {
    viewers?: number
    heat?: { dow: number; hour: number; count: number }[]
    countries?: { code: string; count: number }[]
    country_sample?: number
    abroad?: { code: string; label: string; count: number }[]
    abroad_sample?: number
    states?: { label: string; count: number }[]
    state_sample?: number
    ages?: { label: string; count: number }[]
    age_sample?: number
  }

  // 7 weekdays (0 = Sunday) x 24 hours
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const h of d.heat ?? []) {
    if (h.dow >= 0 && h.dow < 7 && h.hour >= 0 && h.hour < 24) heat[h.dow][h.hour] = num(h.count)
  }

  return {
    viewers: num(d.viewers),
    heat,
    countries: (d.countries ?? []).map(c => ({ code: String(c.code).toUpperCase(), count: num(c.count) })),
    countrySample: num(d.country_sample),
    abroad: (d.abroad ?? []).map(r => ({ code: String(r.code).toUpperCase(), label: String(r.label), count: num(r.count) })),
    abroadSample: num(d.abroad_sample),
    states: (d.states ?? []).map(s => ({ label: s.label, count: num(s.count) })),
    stateSample: num(d.state_sample),
    ages: [...(d.ages ?? [])]
      .map(a => ({ label: a.label, count: num(a.count) }))
      .sort((a, b) => AGE_ORDER.indexOf(a.label) - AGE_ORDER.indexOf(b.label)),
    ageSample: num(d.age_sample),
  }
}

/** Audience breakdown for one range. null = no access, or the query isn't available. */
export async function getAudience(userId: string, days: AnalyticsRange, tz: string = DEFAULT_TZ): Promise<Audience | null> {
  if (!(await hasAnalyticsAccess(userId))) return null
  return fetchAudience(createAdminClient(), userId, days, tz)
}

interface PostRow {
  id: string
  body: string | null
  created_at: string
  impressions_count: number | null
  likes_count: number | null
  comments_count: number | null
  reposts_count: number | null
  quotes_count: number | null
  bookmarks_count: number | null
  profile_visits_count: number | null
}

/** Everything the analytics page needs on first load. null = no access (not free for all, and no active Premium). */
export async function getAnalyticsBundle(userId: string, tz: string = DEFAULT_TZ): Promise<AnalyticsBundle | null> {
  if (!(await hasAnalyticsAccess(userId))) return null

  const admin = createAdminClient()
  const now = new Date()
  const since365 = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString()

  const [seriesRows, postsRes, audience] = await Promise.all([
    cached<DayRow[]>(admin, `series:${userId}:${tz}`, async () => {
      const { data, error } = await admin.rpc('creator_daily_series', { p_user_id: userId, p_days: SERIES_DAYS, p_tz: tz })
      if (error) {
        console.error('[analytics] creator_daily_series failed (is migration 061 applied?):', error.message)
        return null
      }
      return ((data ?? []) as Record<string, unknown>[]).map(r => ({
        d: String(r.d),
        impressions: num(r.impressions),
        likes: num(r.likes),
        replies: num(r.replies),
        reposts: num(r.reposts),
        quotes: num(r.quotes),
        bookmarks: num(r.bookmarks),
        follows: num(r.follows),
      }))
    }),
    admin
      .from('posts')
      .select('id, body, created_at, impressions_count, likes_count, comments_count, reposts_count, quotes_count, bookmarks_count, profile_visits_count')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .is('parent_post_id', null)
      .neq('post_type', 'repost')
      .gte('created_at', since365)
      .lte('created_at', now.toISOString())   // scheduled posts that haven't gone out yet
      .order('created_at', { ascending: false })
      .limit(1000),
    fetchAudience(admin, userId, DEFAULT_RANGE, tz),
  ])

  const series: DayRow[] = seriesRows ?? []

  if (postsRes.error) console.error('[analytics] posts query failed:', postsRes.error.message)
  const posts: PostStat[] = ((postsRes.data ?? []) as PostRow[]).map(p => ({
    id: p.id,
    body: (p.body ?? '').trim().slice(0, 200),
    createdAt: p.created_at,
    day: localDay(p.created_at, tz),
    impressions: num(p.impressions_count),
    likes: num(p.likes_count),
    comments: num(p.comments_count),
    reposts: num(p.reposts_count),
    quotes: num(p.quotes_count),
    bookmarks: num(p.bookmarks_count),
    profileVisits: num(p.profile_visits_count),
  }))

  return { tz, series, seriesAvailable: series.length > 0, posts, audience }
}
