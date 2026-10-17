// src/lib/analytics.ts
//
// Data for the Premium-only /analytics page. Server only.
//
// getCreatorAnalytics() checks Spup Premium ITSELF and returns null when it
// isn't active, so there is no way to get this data by calling it from another
// page without Premium. Everything is the creator's own data and is aggregated:
// the audience numbers are counts, never a list of who viewed.

import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { isPremiumActive } from '@/lib/premium'

export const ANALYTICS_RANGES = [7, 28, 90] as const
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number]
export const DEFAULT_RANGE: AnalyticsRange = 28

/** A breakdown is only shown when at least this many viewers sit behind it. */
export const MIN_AUDIENCE_SAMPLE = 5

const AGE_ORDER = ['Under 18', '18-24', '25-34', '35-44', '45+']

export interface Bucket { label: string; count: number }

export interface TopPost {
  id: string
  body: string
  createdAt: string
  impressions: number
  engagements: number
  likes: number
  comments: number
  reposts: number
}

export interface CreatorAnalytics {
  days: AnalyticsRange
  totals: {
    posts: number
    impressions: number
    likes: number
    comments: number
    reposts: number
    bookmarks: number
    profileVisits: number
    newFollowers: number
    engagementRate: number          // % of impressions that became a like/comment/repost/quote/save
  }
  topPosts: TopPost[]
  /** null = the audience query isn't available (e.g. migration 058 not run yet) */
  audience: null | {
    viewers: number
    activeHours: number[]           // 24 buckets, hour of day in Africa/Lagos
    states: Bucket[]
    stateSample: number
    ages: Bucket[]
    ageSample: number
  }
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

const n = (v: number | null | undefined) => v ?? 0

export async function getCreatorAnalytics(userId: string, days: AnalyticsRange): Promise<CreatorAnalytics | null> {
  if (!(await isPremiumActive(userId))) return null

  const admin = createAdminClient()
  const now = new Date()
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

  const [postsRes, followersRes, audienceRes] = await Promise.all([
    admin
      .from('posts')
      .select('id, body, created_at, impressions_count, likes_count, comments_count, reposts_count, quotes_count, bookmarks_count, profile_visits_count')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .is('parent_post_id', null)
      .neq('post_type', 'repost')
      .gte('created_at', since)
      .lte('created_at', now.toISOString())   // scheduled posts that haven't gone out yet
      .order('created_at', { ascending: false })
      .limit(500),
    admin
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', userId)
      .gte('created_at', since),
    admin.rpc('creator_audience_stats', { p_user_id: userId, p_since: since }),
  ])

  if (postsRes.error) console.error('[analytics] posts query failed:', postsRes.error.message)
  const posts = (postsRes.data ?? []) as PostRow[]

  const sum = (pick: (p: PostRow) => number | null) => posts.reduce((acc, p) => acc + n(pick(p)), 0)
  const impressions = sum(p => p.impressions_count)
  const likes = sum(p => p.likes_count)
  const comments = sum(p => p.comments_count)
  const reposts = sum(p => p.reposts_count)
  const quotes = sum(p => p.quotes_count)
  const bookmarks = sum(p => p.bookmarks_count)
  const engagementsAll = likes + comments + reposts + quotes + bookmarks

  const topPosts: TopPost[] = posts
    .map(p => ({
      id: p.id,
      body: (p.body ?? '').trim(),
      createdAt: p.created_at,
      impressions: n(p.impressions_count),
      likes: n(p.likes_count),
      comments: n(p.comments_count),
      reposts: n(p.reposts_count),
      engagements: n(p.likes_count) + n(p.comments_count) + n(p.reposts_count) + n(p.quotes_count) + n(p.bookmarks_count),
    }))
    .sort((a, b) => b.engagements - a.engagements || b.impressions - a.impressions)
    .slice(0, 5)

  let audience: CreatorAnalytics['audience'] = null
  if (audienceRes.error) {
    console.error('[analytics] creator_audience_stats failed (is migration 058 applied?):', audienceRes.error.message)
  } else if (audienceRes.data) {
    const d = audienceRes.data as {
      viewers: number
      hours: { hour: number; count: number }[]
      states: Bucket[]
      state_sample: number
      ages: Bucket[]
      age_sample: number
    }
    const activeHours = Array.from({ length: 24 }, () => 0)
    for (const h of d.hours ?? []) if (h.hour >= 0 && h.hour < 24) activeHours[h.hour] = h.count
    audience = {
      viewers: Number(d.viewers ?? 0),
      activeHours,
      states: d.states ?? [],
      stateSample: Number(d.state_sample ?? 0),
      ages: [...(d.ages ?? [])].sort((a, b) => AGE_ORDER.indexOf(a.label) - AGE_ORDER.indexOf(b.label)),
      ageSample: Number(d.age_sample ?? 0),
    }
  }

  return {
    days,
    totals: {
      posts: posts.length,
      impressions,
      likes,
      comments,
      reposts,
      bookmarks,
      profileVisits: sum(p => p.profile_visits_count),
      newFollowers: followersRes.count ?? 0,
      engagementRate: impressions > 0 ? Math.round((engagementsAll / impressions) * 1000) / 10 : 0,
    },
    topPosts,
    audience,
  }
}