// src/app/robots.ts
// Next.js generates /robots.txt from this file automatically.
//
// NOTE: this file must be named robots.ts (plural). The old file was called
// robot.ts, which Next.js ignores - so no robots.txt (and no Sitemap: line)
// was ever being served. Delete src/app/robot.ts when you add this one.

import type { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/p/', '/u/', '/discover', '/about', '/terms', '/privacy', '/contact', '/content-policy', '/reviews'],
        disallow: [
          '/feed',         // auth-gated app screens
          '/post/',        // in-app version; logged-out visitors are sent to /p/
          '/user/',        // in-app version; logged-out visitors are sent to /u/
          '/explore',
          '/messages',
          '/notifications',
          '/profile',
          '/wallet',
          '/settings',
          '/compose',
          '/admin',
          '/api/',
          '/onboarding',
          '/complete-profile',
          '/verify-otp',
          '/verify-email',
        ],
      },
      // The AdSense reviewer. Explicitly allowed so it can see the public pages.
      { userAgent: 'Mediapartners-Google', allow: ['/'], disallow: ['/api/', '/feed', '/wallet', '/settings'] },
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
