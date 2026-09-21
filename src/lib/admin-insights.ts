// src/lib/admin-insights.ts
//
// Data for the admin Insights page.
//   getInsights()        fetches the five aggregation functions (migration 026)
//   buildInsightsModel() turns their raw JSON into ready-to-display rows -
//                        pure, so it can be tested without a database.
// Each section succeeds or fails on its own: one broken query never blanks
// the whole page.

import { createAdminClient } from '@/lib/supabase/server'
import { NIGERIAN_STATES, canonicalState, matchStateFromText, matchCountryFromText } from '@/lib/nigeria'

// ── Raw shapes returned by the SQL functions ─────────────────────────────────
type DayCount = { day: string; count: number }
type LabelCount = { label: string; count: number }

export interface RegistrationsRaw {
  total: number; new_period: number; prev_period: number; with_country: number
  daily: DayCount[]
  by_country: { code: string; count: number }[]
  by_region: { region: string; count: number }[]
  unlocated: { location: string; count: number }[]
  unlocated_no_text: number
}
export interface UsageRaw {
  dau_today: number; wau: number; mau: number; active_period: number; sessions_period: number
  tracking_since: string | null
  daily: DayCount[]
  by_hour: { hour: number; count: number }[]
  by_weekday: { weekday: number; count: number }[]
  retained_7d: number; eligible_7d: number
  posts: number; replies: number; quotes: number; reposts: number
  likes: number; follows: number; bookmarks: number; messages: number | null
}
export interface DevicesRaw {
  active_users: number; total_users: number
  by_device_type: LabelCount[]; by_os: LabelCount[]; by_browser: LabelCount[]; by_app_mode: LabelCount[]
  signup_by_device_type: LabelCount[]
}
export interface ContentRaw {
  total_posts: number; active_authors: number; total_users: number
  avg_length: number | null; selling: number | null
  daily: DayCount[]
  by_type: LabelCount[]; by_language: LabelCount[]
  posts_with_media: number; media_by_type: LabelCount[]
  buckets: LabelCount[]
  posts_by_region: { region: string; count: number }[]
}
export interface TopicsRaw {
  hashtags: { tag: string; count: number; prev: number }[]
  unique_tags: number; tagged_posts: number; total_posts: number
  interests: { interest: string; users: number }[]
  users_with_interests: number
}

export type Section<T> = { ok: true; data: T } | { ok: false; error: string }
export interface RawInsights {
  registrations: Section<RegistrationsRaw>
  usage: Section<UsageRaw>
  devices: Section<DevicesRaw>
  content: Section<ContentRaw>
  topics: Section<TopicsRaw>
}

// ── Fetch ───────────────────────────────────────────────────────────────────
export async function getInsights(days: number): Promise<RawInsights> {
  const admin = createAdminClient()
  async function call<T>(fn: string): Promise<Section<T>> {
    try {
      const { data, error } = await admin.rpc(fn, { p_days: days })
      if (error) return { ok: false, error: error.message }
      return { ok: true, data: data as T }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
  }
  const [registrations, usage, devices, content, topics] = await Promise.all([
    call<RegistrationsRaw>('admin_insights_registrations'),
    call<UsageRaw>('admin_insights_usage'),
    call<DevicesRaw>('admin_insights_devices'),
    call<ContentRaw>('admin_insights_content'),
    call<TopicsRaw>('admin_insights_topics'),
  ])
  return { registrations, usage, devices, content, topics }
}

// ── View models ────────────────────────────────────────────────────────────
export interface BarRow { label: string; value: number; share: number; note?: string; badge?: string }
export interface Growth { pct: number | null; dir: 'up' | 'down' | 'flat' | 'new' }

export interface GeographyModel {
  totalUsers: number
  detected: number; estimated: number; unknown: number
  countries: { code: string; name: string; flag: string; count: number; share: number; detected: number; estimated: number }[]
  states: { state: string; count: number; share: number; detected: number; estimated: number }[]
  nigeriaUsers: number; nigeriaWithState: number
  statesWithUsers: number; statesEmpty: string[]
}
export interface RegistrationsModel {
  total: number; newPeriod: number; growth: Growth
  daily: DayCount[]
  geography: GeographyModel
}
export interface UsageModel {
  dauToday: number; wau: number; mau: number
  stickiness: number | null
  activePeriod: number; sessionsPeriod: number; sessionsPerActive: number | null
  retention7: { retained: number; eligible: number; pct: number | null }
  trackingSince: string | null
  daily: DayCount[]
  hours: { hour: number; label: string; count: number }[]
  peakHour: string | null
  weekdays: { label: string; count: number }[]
  peakWeekday: string | null
  actions: { label: string; count: number; perActive: number | null }[]
}
export interface DevicesModel {
  activeUsers: number; totalUsers: number; coverage: number | null
  deviceTypes: BarRow[]; os: BarRow[]; browsers: BarRow[]; appModes: BarRow[]; signupDevices: BarRow[]
}
export interface ContentModel {
  totalPosts: number; activeAuthors: number
  postsPerAuthor: number | null; avgLength: number | null
  mediaShare: number | null; selling: number | null
  daily: DayCount[]
  types: BarRow[]; languages: BarRow[]; media: BarRow[]; buckets: BarRow[]
  regional: { state: string; users: number; posts: number; postsPerUser: number | null }[]
}
export interface TopicsModel {
  hashtags: { tag: string; count: number; prev: number; change: Growth }[]
  uniqueTags: number; taggedShare: number | null
  interests: BarRow[]
  interestCategories: BarRow[]
  usersWithInterests: number
}
export interface InsightsModel {
  registrations: Section<RegistrationsModel>
  usage: Section<UsageModel>
  devices: Section<DevicesModel>
  content: Section<ContentModel>
  topics: Section<TopicsModel>
}

// ── Small helpers ───────────────────────────────────────────────────────────
const safeDiv = (a: number, b: number): number | null => (b > 0 ? a / b : null)
const round1 = (n: number) => Math.round(n * 10) / 10

export function growth(cur: number, prev: number): Growth {
  if (prev === 0) return cur === 0 ? { pct: null, dir: 'flat' } : { pct: null, dir: 'new' }
  const pct = Math.round(((cur - prev) / prev) * 100)
  return { pct, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' }
}

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}
export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return ''
  return String.fromCodePoint(...[...code].map(c => 127397 + c.charCodeAt(0)))
}

function bars(rows: LabelCount[], total: number, pretty: (l: string) => string = l => l): BarRow[] {
  return rows.map(r => ({ label: pretty(r.label), value: r.count, share: total > 0 ? r.count / total : 0 }))
}

const DEVICE_LABELS: Record<string, string> = { mobile: 'Phone', tablet: 'Tablet', desktop: 'Desktop', unknown: 'Unknown' }
const APP_MODE_LABELS: Record<string, string> = { app: 'Mobile app', pwa: 'Installed web app', browser: 'Web browser', unknown: 'Unknown' }
const POST_TYPE_LABELS: Record<string, string> = { original: 'Posts', reply: 'Replies', quote: 'Quotes', repost: 'Reposts' }
const MEDIA_LABELS: Record<string, string> = { image: 'Photos', video: 'Videos', gif: 'GIFs', audio: 'Audio' }
const LANGUAGE_LABELS: Record<string, string> = { en: 'English', pcm: 'Pidgin', yo: 'Yoruba', ha: 'Hausa', ig: 'Igbo', unknown: 'Unknown' }

export function hourLabel(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${h < 12 ? 'am' : 'pm'}`
}
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── Geography (registrations by country + Nigeria by state) ────────────────────
export function buildGeography(reg: RegistrationsRaw): GeographyModel {
  const total = reg.total

  // 1. Detected at signup / last visit (from the hosting platform)
  const detectedCountry = new Map<string, number>()
  for (const r of reg.by_country) detectedCountry.set(r.code.toUpperCase(), (detectedCountry.get(r.code.toUpperCase()) ?? 0) + r.count)

  const detectedState = new Map<string, number>()
  let nigeriaOtherRegion = 0
  for (const r of reg.by_region) {
    const s = canonicalState(r.region)
    if (s) detectedState.set(s, (detectedState.get(s) ?? 0) + r.count)
    else nigeriaOtherRegion += r.count
  }

  // 2. Estimated from what people typed as their profile location, only for
  //    users whose location was never detected.
  const estimatedCountry = new Map<string, number>()
  const estimatedState = new Map<string, number>()
  let unknown = reg.unlocated_no_text
  for (const u of reg.unlocated) {
    const code = matchCountryFromText(u.location)
    const state = matchStateFromText(u.location)
    if (code) estimatedCountry.set(code, (estimatedCountry.get(code) ?? 0) + u.count)
    else unknown += u.count
    if (state) estimatedState.set(state, (estimatedState.get(state) ?? 0) + u.count)
  }

  const codes = new Set([...detectedCountry.keys(), ...estimatedCountry.keys()])
  const countries = [...codes].map(code => {
    const d = detectedCountry.get(code) ?? 0
    const e = estimatedCountry.get(code) ?? 0
    return { code, name: countryName(code), flag: countryFlag(code), count: d + e, share: total > 0 ? (d + e) / total : 0, detected: d, estimated: e }
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  const stateNames = new Set([...detectedState.keys(), ...estimatedState.keys()])
  const states = [...stateNames].map(state => {
    const d = detectedState.get(state) ?? 0
    const e = estimatedState.get(state) ?? 0
    return { state, count: d + e, share: total > 0 ? (d + e) / total : 0, detected: d, estimated: e }
  }).sort((a, b) => b.count - a.count || a.state.localeCompare(b.state))

  const detected = [...detectedCountry.values()].reduce((a, b) => a + b, 0)
  const estimated = [...estimatedCountry.values()].reduce((a, b) => a + b, 0)
  const nigeria = countries.find(c => c.code === 'NG')
  const withState = states.reduce((a, s) => a + s.count, 0)

  return {
    totalUsers: total,
    detected, estimated, unknown,
    countries, states,
    nigeriaUsers: nigeria?.count ?? 0,
    nigeriaWithState: withState,
    statesWithUsers: states.length,
    statesEmpty: NIGERIAN_STATES.filter(s => !stateNames.has(s)),
  }
}

// ── Whole-page model ────────────────────────────────────────────────────────
function map<A, B>(s: Section<A>, f: (a: A) => B): Section<B> {
  if (!s.ok) return s
  try { return { ok: true, data: f(s.data) } } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not read this section' }
  }
}

export function buildInsightsModel(
  raw: RawInsights,
  interestMeta: Record<string, { label: string; category: string }> = {},
): InsightsModel {
  const registrations = map(raw.registrations, r => ({
    total: r.total,
    newPeriod: r.new_period,
    growth: growth(r.new_period, r.prev_period),
    daily: r.daily,
    geography: buildGeography(r),
  }))

  const usage = map(raw.usage, u => {
    const hourMap = new Map(u.by_hour.map(h => [h.hour, h.count]))
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: hourLabel(h), count: hourMap.get(h) ?? 0 }))
    const peak = hours.reduce((best, h) => (h.count > best.count ? h : best), hours[0])
    const dayMap = new Map(u.by_weekday.map(d => [d.weekday, d.count]))
    const weekdays = WEEKDAYS.map((label, i) => ({ label, count: dayMap.get(i + 1) ?? 0 }))
    const peakDay = weekdays.reduce((best, d) => (d.count > best.count ? d : best), weekdays[0])
    const per = (n: number) => { const v = safeDiv(n, u.active_period); return v === null ? null : round1(v) }
    const actions = [
      { label: 'Posts', count: u.posts }, { label: 'Replies', count: u.replies },
      { label: 'Quotes', count: u.quotes }, { label: 'Reposts', count: u.reposts },
      { label: 'Likes', count: u.likes }, { label: 'Follows', count: u.follows },
      { label: 'Bookmarks', count: u.bookmarks },
      ...(u.messages === null ? [] : [{ label: 'Messages', count: u.messages }]),
    ].map(a => ({ ...a, perActive: per(a.count) }))
    const ret = safeDiv(u.retained_7d, u.eligible_7d)
    return {
      dauToday: u.dau_today, wau: u.wau, mau: u.mau,
      stickiness: safeDiv(u.dau_today, u.mau),
      activePeriod: u.active_period, sessionsPeriod: u.sessions_period,
      sessionsPerActive: (() => { const v = safeDiv(u.sessions_period, u.active_period); return v === null ? null : round1(v) })(),
      retention7: { retained: u.retained_7d, eligible: u.eligible_7d, pct: ret === null ? null : Math.round(ret * 100) },
      trackingSince: u.tracking_since,
      daily: u.daily,
      hours,
      peakHour: peak.count > 0 ? peak.label : null,
      weekdays,
      peakWeekday: peakDay.count > 0 ? peakDay.label : null,
      actions,
    }
  })

  const devices = map(raw.devices, d => ({
    activeUsers: d.active_users,
    totalUsers: d.total_users,
    coverage: safeDiv(d.active_users, d.total_users),
    deviceTypes: bars(d.by_device_type, d.active_users, l => DEVICE_LABELS[l] ?? l),
    os: bars(d.by_os, d.active_users, l => (l === 'unknown' ? 'Unknown' : l)),
    browsers: bars(d.by_browser, d.active_users, l => (l === 'unknown' ? 'Unknown' : l)),
    appModes: bars(d.by_app_mode, d.active_users, l => APP_MODE_LABELS[l] ?? l),
    signupDevices: bars(d.signup_by_device_type, d.signup_by_device_type.reduce((a, r) => a + r.count, 0), l => DEVICE_LABELS[l] ?? l),
  }))

  const geo = registrations.ok ? registrations.data.geography : null
  const content = map(raw.content, c => {
    const usersByState = new Map((geo?.states ?? []).map(s => [s.state, s.detected]))
    const regional = c.posts_by_region
      .map(r => ({ state: canonicalState(r.region) ?? r.region, posts: r.count }))
      .reduce((acc, r) => { acc.set(r.state, (acc.get(r.state) ?? 0) + r.posts); return acc }, new Map<string, number>())
    const regionalRows = [...regional.entries()].map(([state, posts]) => {
      const users = usersByState.get(state) ?? 0
      const ppu = safeDiv(posts, users)
      return { state, users, posts, postsPerUser: ppu === null ? null : round1(ppu) }
    }).sort((a, b) => b.posts - a.posts)
    const ppa = safeDiv(c.total_posts, c.active_authors)
    const bucketTotal = c.buckets.reduce((a, b) => a + b.count, 0)
    const mediaTotal = c.media_by_type.reduce((a, b) => a + b.count, 0)
    return {
      totalPosts: c.total_posts, activeAuthors: c.active_authors,
      postsPerAuthor: ppa === null ? null : round1(ppa),
      avgLength: c.avg_length,
      mediaShare: safeDiv(c.posts_with_media, c.total_posts),
      selling: c.selling,
      daily: c.daily,
      types: bars(c.by_type, c.total_posts, l => POST_TYPE_LABELS[l] ?? l),
      languages: bars(c.by_language, c.total_posts, l => LANGUAGE_LABELS[l] ?? l),
      media: bars(c.media_by_type, mediaTotal, l => MEDIA_LABELS[l] ?? l),
      buckets: bars(c.buckets, bucketTotal),
      regional: regionalRows,
    }
  })

  const topics = map(raw.topics, t => {
    const catTotals = new Map<string, number>()
    const interestRows: BarRow[] = t.interests.map(i => {
      const meta = interestMeta[i.interest]
      const category = meta?.category ?? 'Other'
      catTotals.set(category, (catTotals.get(category) ?? 0) + i.users)
      return {
        label: meta?.label ?? i.interest,
        value: i.users,
        share: t.users_with_interests > 0 ? i.users / t.users_with_interests : 0,
        badge: category,
      }
    })
    const catSum = [...catTotals.values()].reduce((a, b) => a + b, 0)
    const categories: BarRow[] = [...catTotals.entries()]
      .map(([label, value]) => ({ label, value, share: catSum > 0 ? value / catSum : 0 }))
      .sort((a, b) => b.value - a.value)
    return {
      hashtags: t.hashtags.map(h => ({ tag: h.tag, count: h.count, prev: h.prev, change: growth(h.count, h.prev) })),
      uniqueTags: t.unique_tags,
      taggedShare: safeDiv(t.tagged_posts, t.total_posts),
      interests: interestRows,
      interestCategories: categories,
      usersWithInterests: t.users_with_interests,
    }
  })

  return { registrations, usage, devices, content, topics }
}
