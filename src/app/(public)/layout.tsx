// src/app/(public)/layout.tsx
//
// Shell for the logged-out, crawlable pages (/p/[id], /u/[username], /discover).
// Deliberately NOT inside (main): that layout redirects anyone without a
// session to /login, which is what hid every post from Google.

import Link from 'next/link'
import LandingFooter from '@/components/landing/landing-footer'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--color-bg)', minHeight: '100dvh',
      fontFamily: "'DM Sans', sans-serif", color: 'var(--color-text-primary)',
    }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 20,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          maxWidth: 720, margin: '0 auto', padding: '10px 20px',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Spup" width={34} height={34}
              style={{ borderRadius: 6, filter: 'brightness(0) invert(1) sepia(1) saturate(3) hue-rotate(95deg)' }} />
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, color: 'var(--color-brand)' }}>
              Spup
            </span>
          </Link>
          <nav style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link href="/discover" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
              Discover
            </Link>
            <Link href="/login" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
              Log in
            </Link>
            <Link href="/signup" style={{
              background: 'var(--color-brand)', color: 'white', textDecoration: 'none',
              fontSize: 14, fontWeight: 700, padding: '8px 16px', borderRadius: 100,
            }}>
              Register
            </Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 72 }}>{children}</main>

      <LandingFooter />
    </div>
  )
}
