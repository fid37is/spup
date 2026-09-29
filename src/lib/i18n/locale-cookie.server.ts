import { cookies } from 'next/headers'
import { DEFAULT_LOCALE, isLocale, type Locale } from './dictionaries'
import { LOCALE_COOKIE } from './locale-cookie'

// Server-only (imports next/headers). Never trust the cookie blindly - an
// unknown value falls back to English.
export async function getCookieLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}
