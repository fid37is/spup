import type { Metadata, Viewport } from 'next'
import './globals.css'
import PWAProvider from '@/components/layout/pwa-provider'
import { WaitlistProvider } from '@/components/landing/waitlist-context'
import { GoogleAnalytics } from '@next/third-parties/google'

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
    default: 'Spup — Speak Up. Be Heard.',
    template: '%s | Spup',
  },
  description: 'Where Nigerian conversations happen — and where the people having them get paid. Join Spup: Nigeria\'s social platform with 70% ad revenue sharing.',

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
    title: 'Spup — Speak Up. Be Heard.',
    description: 'Nigeria\'s social platform where creators earn 70% of ad revenue. Join the conversation.',
    url: BASE_URL,
    locale: 'en_NG',
    images: [
      {
        url: '/og/default.png',
        width: 1200,
        height: 630,
        alt: 'Spup — Nigeria\'s social platform',
        type: 'image/png',
      },
    ],
  },

  // ── Twitter / X ─────────────────────────────────────────────────────────
  twitter: {
    card: 'summary_large_image',
    title: 'Spup — Speak Up. Be Heard.',
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
      { url: '/splash/splash-1170x2532.png', media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/splash/splash-1284x2778.png', media: '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)' },
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-96x96.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-72x72.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* WhatsApp / LinkedIn / Facebook additional OG tags not covered by Next metadata */}
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="fb:app_id" content={process.env.NEXT_PUBLIC_FB_APP_ID ?? ''} />

        {/* Structured data — website + sitelinks searchbox */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        {/* Theme: only override data-theme in authenticated app routes */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('spup-theme');
                  var isApp = /^\/(feed|explore|notifications|profile|wallet|settings|post|user)/.test(window.location.pathname);
                  if (isApp && saved === 'light') {
                    document.documentElement.setAttribute('data-theme', 'light');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <PWAProvider />
        <WaitlistProvider>
          {children}
        </WaitlistProvider>
        {process.env.NEXT_PUBLIC_GA_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
        )}
      </body>
    </html>
  )
}