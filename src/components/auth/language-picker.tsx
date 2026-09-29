'use client'

import { useRouter } from 'next/navigation'
import { LOCALES, isLocale } from '@/lib/i18n/dictionaries'
import { useTranslation } from '@/lib/i18n/language-context'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '@/lib/i18n/locale-cookie'

// Language choice for logged-out screens. Swaps the client dictionary at once,
// remembers the choice in a cookie (read by the (auth) layout and by signup, so
// it becomes the new account's language), and refreshes so server-rendered
// bits of the layout (the footer) follow along.
export default function AuthLanguagePicker() {
  const { locale, setLocale, t } = useTranslation()
  const router = useRouter()

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    if (!isLocale(next)) return
    setLocale(next)
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`
    router.refresh()
  }

  return (
    <select
      value={locale}
      onChange={onChange}
      aria-label={t('auth.language')}
      style={{
        background: 'var(--color-bg)', color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border)', borderRadius: 8,
        padding: '6px 8px', fontSize: 13, fontFamily: "'DM Sans', sans-serif",
        cursor: 'pointer', outline: 'none',
      }}
    >
      {LOCALES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
    </select>
  )
}
