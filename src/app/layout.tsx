import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import PWAProvider from '@/components/layout/pwa-provider'
import { WaitlistProvider } from '@/components/landing/waitlist-context'
import { getWaitlistOpenStatus } from '@/lib/queries/settings'
import { GoogleAnalytics } from '@next/third-parties/google'
import { ToastProvider } from '@/components/layout/toast'
import { NetworkStatusProvider } from '@/lib/network-status'
import NativeSplashHider from '@/components/layout/native-splash-hider'
import { AppThemeProvider } from '@/components/layout/theme-provider'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

export const viewport: Viewport = {
  themeColor: '#1A7A4A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  title: {
    default: 'Spup - Speak Up. Be Heard.',
    template: '%s | Spup',
  },
  description: 'Where Nigerian conversations happen - and where the people having them get paid. Join Spup: Nigeria\'s social platform with 70% ad revenue sharing.',

  // ── Canonical & alternate languages ────────────────────────────────────
  alternates: {
    canonical: '/',
    languages: { 'en-NG': '/' },
  },

  // ── Indexing ────────────────────────────────────────────────────────────
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  // ── Open Graph ──────────────────────────────────────────────────────────
  openGraph: {
    type: 'website',
    siteName: 'Spup',
    title: 'Spup - Speak Up. Be Heard.',
    description: 'Nigeria\'s social platform where creators earn 70% of ad revenue. Join the conversation.',
    url: BASE_URL,
    locale: 'en_NG',
    images: [
      {
        url: '/og/default.png',
        width: 1200,
        height: 630,
        alt: 'Spup - Nigeria\'s social platform',
        type: 'image/png',
      },
    ],
  },

  // ── Twitter / X ─────────────────────────────────────────────────────────
  twitter: {
    card: 'summary_large_image',
    title: 'Spup - Speak Up. Be Heard.',
    description: 'Nigeria\'s social platform where creators earn 70% of ad revenue.',
    images: ['/og/default.png'],
  },

  // ── PWA / Apple ─────────────────────────────────────────────────────────
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Spup',
    startupImage: [
      { url: '/splash/splash-1242x2688.png', media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)' },
    ],
  },
  formatDetection: { telephone: false },

  // ── App links (deep linking) ─────────────────────────────────────────────
  appLinks: {
    android: {
      package: 'com.spup.app',
      app_name: 'Spup',
    },
  },

  // ── General ─────────────────────────────────────────────────────────────
  category: 'social',
  classification: 'Social Media',
  keywords: [
    'Nigerian social media', 'Spup', 'Naija Twitter', 'creator monetisation Nigeria',
    'Nigerian creators', 'earn from social media Nigeria', 'Naira payouts', 'speak up Nigeria',
  ],
  authors: [{ name: 'Spup', url: BASE_URL }],
  creator: 'Spup',
  publisher: 'Spup',
  generator: 'Next.js',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Deliberately NOT awaited. This used to block the HTML for every page in
  // the app (including /feed) on a database round trip, when the value is
  // only needed if someone opens the waitlist modal. WaitlistProvider
  // unwraps the promise lazily, at that point.
  const waitlistOpen = getWaitlistOpenStatus().catch(() => true)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Spup',
    url: BASE_URL,
    description: 'Nigerian social media platform with creator revenue sharing.',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${BASE_URL}/explore?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }

  return (
    <html lang="en-NG" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-96x96.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-72x72.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* WhatsApp / LinkedIn / Facebook additional OG tags not covered by Next metadata */}
        <meta name="facebook-domain-verification" content="68oged2m46v5yyuiij11m0q5bxbxeh" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="fb:app_id" content={process.env.NEXT_PUBLIC_FB_APP_ID ?? ''} />

        {/* Structured data - website + sitelinks searchbox */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        {/* Theme: resolve and paint the real theme before first paint, on
            EVERY route - not just a hand-maintained whitelist of app paths.
            (That whitelist was the actual source of the dark flash: it only
            ever ran on a hard page load, so the first client-side
            navigation into an app route - from "/", from login, from
            onboarding - left <html> on whatever the previous page's theme
            was until AppThemeProvider corrected it a beat later.
            AppThemeProvider is now mounted once here at the root instead of
            inside (main)/layout.tsx, so it persists across those
            navigations instead of remounting into a stale attribute.) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('spup-theme'); // 'light' | 'dark' | 'system' | null
                  var resolved = (saved === 'light' || saved === 'dark')
                    ? saved
                    // No explicit choice (first visit, or preference is
                    // "system") - follow the OS/browser setting instead of
                    // the hardcoded dark default below.
                    : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
                  // Always set explicitly (both light and dark) so we never
                  // rely on the static data-theme="dark" attribute surviving
                  // a soft navigation, a partial document update, or a
                  // browser that paints before the attribute is applied.
                  document.documentElement.setAttribute('data-theme', resolved);
                  // Hint the browser's native UI (scrollbars, form controls)
                  // to match immediately — reduces residual chrome flashes.
                  document.documentElement.style.colorScheme = resolved;
                  // Unlock transitions only after the correct theme is set.
                  // Paired with html:not(.theme-ready) body { transition: none }
                  // in globals.css to kill residual flicker.
                  document.documentElement.classList.add('theme-ready');
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <PWAProvider />
        <NativeSplashHider />
        <AppThemeProvider>
          <NetworkStatusProvider>
            <ToastProvider>
              <WaitlistProvider waitlistOpen={waitlistOpen}>
                {children}
              </WaitlistProvider>
            </ToastProvider>
          </NetworkStatusProvider>
        </AppThemeProvider>
        {process.env.NEXT_PUBLIC_GA_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
        )}
        {process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID && (
          <Script
            async
            strategy="afterInteractive"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID}`}
            crossOrigin="anonymous"
          />
        )}
      </body>
    </html>
  )
}