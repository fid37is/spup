// src/app/sitemap.ts
// Next.js generates /sitemap.xml from this file automatically.
// Covers: static pages + public user profiles + public posts.

import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

// Static pages that are always public
const STATIC_PAGES: MetadataRoute.Sitemap = [
  { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
  { url: `${BASE_URL}/terms`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  { url: `${BASE_URL}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  { url: `${BASE_URL}/content-policy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient()

  // Public, non-private, non-banned user profiles
  const { data: users } = await supabase
    .from('users')
    .select('username, updated_at')
    .eq('is_private', false)
    .neq('status', 'banned')
    .order('followers_count', { ascending: false })
    .limit(5000)

  const profilePages: MetadataRoute.Sitemap = (users ?? []).map(u => ({
    url: `${BASE_URL}/user/${u.username}`,
    lastModified: u.updated_at ? new Date(u.updated_at) : new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }))

  // Recent public posts (non-sensitive, not deleted)
  const { data: posts } = await supabase
    .from('posts')
    .select('id, created_at, updated_at')
    .is('deleted_at', null)
    .eq('is_sensitive', false)
    .is('parent_post_id', null)   // top-level posts only
    .order('created_at', { ascending: false })
    .limit(10000)

  const postPages: MetadataRoute.Sitemap = (posts ?? []).map(p => ({
    url: `${BASE_URL}/post/${p.id}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : new Date(p.created_at),
    changeFrequency: 'hourly' as const,
    priority: 0.6,
  }))

  return [...STATIC_PAGES, ...profilePages, ...postPages]
}