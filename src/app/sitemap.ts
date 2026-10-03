// src/app/sitemap.ts
// Next.js generates /sitemap.xml from this file automatically.
//
// Lists the PUBLIC pages only: /p/[id] posts and /u/[username] profiles (the
// versions Google can actually open), plus /discover and the static pages.
// The in-app /post/ and /user/ URLs are no longer listed - they redirect
// logged-out visitors, and sitemaps full of redirects get flagged in Search
// Console.

import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/server'
import { MIN_INDEXABLE_BODY } from '@/lib/public-data'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

export const revalidate = 3600

const STATIC_PAGES: MetadataRoute.Sitemap = [
  { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
  { url: `${BASE_URL}/discover`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
  { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  { url: `${BASE_URL}/terms`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  { url: `${BASE_URL}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  { url: `${BASE_URL}/content-policy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const admin = createAdminClient()

  // Public profiles that have actually posted (empty profiles are thin pages).
  const { data: users } = await admin
    .from('users')
    .select('username, updated_at')
    .eq('is_private', false)
    .eq('status', 'active')
    .is('deleted_at', null)
    .or('role.is.null,role.not.in.(admin,moderator)')
    .gt('posts_count', 0)
    .order('followers_count', { ascending: false })
    .limit(5000)

  const profilePages: MetadataRoute.Sitemap = (users ?? []).map(u => ({
    url: `${BASE_URL}/u/${u.username}`,
    lastModified: u.updated_at ? new Date(u.updated_at) : new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }))

  // Top-level, non-sensitive posts by public authors, with real text.
  const { data: posts } = await admin
    .from('posts')
    .select('id, body, created_at, updated_at, author:users!posts_user_id_fkey!inner(is_private, status, deleted_at)')
    .is('deleted_at', null)
    .eq('is_sensitive', false)
    .is('parent_post_id', null)
    .neq('post_type', 'repost')
    .eq('author.is_private', false)
    .eq('author.status', 'active')
    .is('author.deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(20000)

  const postPages: MetadataRoute.Sitemap = (posts ?? [])
    .filter(p => (p.body?.trim().length ?? 0) >= MIN_INDEXABLE_BODY)
    .slice(0, 10000)
    .map(p => ({
      url: `${BASE_URL}/p/${p.id}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : new Date(p.created_at),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))

  return [...STATIC_PAGES, ...profilePages, ...postPages]
}
