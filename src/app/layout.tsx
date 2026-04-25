import type { Metadata, Viewport } from 'next'
import './globals.css'
import PWAProvider from '@/components/layout/pwa-provider'
import { WaitlistProvider } from '@/components/landing/waitlist-context'

export const viewport: Viewport = {
  themeColor: '#1A7A4A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: { default: "Spup - Speak Up. Be Heard.", template: '%s | Spup' },
  description: 'Where Nigerian conversations happen - and where the people having them get paid.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Spup',
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: 'Spup',
    description: "Nigeria's social platform with revenue sharing",
    siteName: 'Spup',
    locale: 'en_NG',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Spup',
    description: "Nigeria's social platform with revenue sharing",
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/*
          Blocking script: runs before first paint.
          Only overrides data-theme if user has saved a preference
          AND they are in the authenticated app (not public pages).
          Public pages always stay dark.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('spup-theme');
                  var isApp = window.location.pathname.startsWith('/feed') ||
                              window.location.pathname.startsWith('/explore') ||
                              window.location.pathname.startsWith('/notifications') ||
                              window.location.pathname.startsWith('/profile') ||
                              window.location.pathname.startsWith('/wallet') ||
                              window.location.pathname.startsWith('/settings') ||
                              window.location.pathname.startsWith('/post') ||
                              window.location.pathname.startsWith('/user');
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
      </body>
    </html>
  )
}