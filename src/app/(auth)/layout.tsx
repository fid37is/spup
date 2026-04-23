import Link from 'next/link'
import { AuthThemeProvider, ThemeToggle } from '@/components/auth/theme-provider'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthThemeProvider>
      <div style={{
        minHeight: '100dvh',
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'DM Sans', sans-serif",
        transition: 'background 0.2s',
      }}>
        {/* Top bar */}
        <header style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--color-border)',
          position: 'sticky', top: 0, zIndex: 50,
          background: 'var(--color-bg)',
          paddingTop: 'max(16px, env(safe-area-inset-top))',
        }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/logo.png" alt="Spup" style={{ width: 30, height: 30, borderRadius: 7 }} />
            <span style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: 20,
              color: 'var(--color-brand)',
              letterSpacing: '-0.02em',
            }}>Spup</span>
          </Link>
          <ThemeToggle />
        </header>

        {/* Main content */}
        <main style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 20px',
        }}>
          <div style={{ width: '100%', maxWidth: 420 }}>
            {children}
          </div>
        </main>

        {/* Footer note */}
        <footer style={{
          padding: '16px 20px',
          textAlign: 'center',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-faint)', lineHeight: 1.6 }}>
            By continuing, you agree to Spup&apos;s{' '}
            <Link href="/terms" style={{ color: 'var(--color-text-muted)', textDecoration: 'underline' }}>Terms of Service</Link>{' '}
            and{' '}
            <Link href="/privacy" style={{ color: 'var(--color-text-muted)', textDecoration: 'underline' }}>Privacy Policy</Link>.
          </p>
        </footer>
      </div>
    </AuthThemeProvider>
  )
}