// src/app/robots.ts
// Next.js generates /robots.txt from this file automatically.

import type { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/user/', '/post/', '/explore', '/terms', '/privacy', '/contact', '/content-policy'],
        disallow: [
          '/feed',         // auth-gated
          '/notifications',
          '/profile',
          '/wallet',
          '/settings',
          '/admin',
          '/api/',
          '/onboarding',
          '/complete-profile',
          '/verify-otp',
          '/verify-email',
        ],
      },
      // Block AI training crawlers
      { userAgent: 'GPTBot', disallow: ['/'] },
      { userAgent: 'CCBot', disallow: ['/'] },
      { userAgent: 'anthropic-ai', disallow: ['/'] },
      { userAgent: 'Claude-Web', disallow: ['/'] },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}