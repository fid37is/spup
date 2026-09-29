import Link from 'next/link'
import { LanguageProvider } from '@/lib/i18n/language-context'
import { loadDictionary, translate } from '@/lib/i18n/dictionaries'
import { getCookieLocale } from '@/lib/i18n/locale-cookie.server'
import { tRich } from '@/lib/i18n/rich'
import AuthLanguagePicker from '@/components/auth/language-picker'

// Auth pages are always dark — no theme toggle here.
// Theme switching is an authenticated-user feature only.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Logged-out visitors have no profile to read a language from, so it comes
  // from the cookie set by the language picker (default: English).
  const locale = await getCookieLocale()
  const dict = await loadDictionary(locale)
  const t = (key: string) => translate(dict, key)

  return (
    <LanguageProvider initialLocale={locale} initialMessages={dict}>
    <div style={{
      minHeight: '100dvh',
      background: 'var(--color-bg)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Top bar */}
      <header style={{
        padding: '16px 20px',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--color-border)',
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--color-bg)',
      }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <img
            src="/logo.png"
            alt="Spup"
            style={{
              width: 34, height: 34, borderRadius: 7,
            }}
          />
          <span style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: 20,
            color: 'var(--color-brand)',
            letterSpacing: '-0.02em',
          }}>
            Spup
          </span>
        </Link>
        <AuthLanguagePicker />
      </header>

      {/* Main content — centred card */}
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

      {/* Footer */}
      <footer style={{
        padding: '16px 20px',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          {tRich(t('auth.terms_notice'), {
            terms: <Link href="/terms" style={{ color: 'var(--color-text-secondary)', textDecoration: 'underline' }}>{t('auth.terms')}</Link>,
            privacy: <Link href="/privacy" style={{ color: 'var(--color-text-secondary)', textDecoration: 'underline' }}>{t('auth.privacy_policy')}</Link>,
          })}
        </p>
      </footer>
    </div>
    </LanguageProvider>
  )
}