export type Locale = 'en' | 'ha' | 'ig' | 'yo' | 'pcm'

// Order here is display order in the language selector.
export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'en',  label: 'English' },
  { code: 'ha',  label: 'Hausa' },
  { code: 'ig',  label: 'Igbo' },
  { code: 'yo',  label: 'Yoruba' },
  { code: 'pcm', label: 'Pidgin' },
]

export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && LOCALES.some(l => l.code === value)
}

// Explicit branches — not a templated `import(`./${locale}.json`)` — so the
// bundler can statically analyze and code-split each one. Only the active
// locale's file is ever fetched; an English-only user never downloads the
// other 4 dictionaries, however many languages we add later.
export async function loadDictionary(locale: Locale): Promise<Record<string, string>> {
  switch (locale) {
    case 'ha':  return (await import('@/locales/ha.json')).default
    case 'ig':  return (await import('@/locales/ig.json')).default
    case 'yo':  return (await import('@/locales/yo.json')).default
    case 'pcm': return (await import('@/locales/pcm.json')).default
    case 'en':
    default:    return (await import('@/locales/en.json')).default
  }
}

// English source of truth, imported eagerly (small JSON) so it's always
// available as a fallback — same fallback behavior as the client-side
// LanguageProvider, just without React or a hook. For Server Components
// that already have `profile` in scope (most of them, via getProfileByAuthId)
// and just need to render a few translated strings without becoming a
// client component: const dict = await loadDictionary(locale); const t = (k, v) => translate(dict, k, v)
import enMessages from '@/locales/en.json'

export function translate(dict: Record<string, string>, key: string, vars?: Record<string, string | number>): string {
  const raw = dict[key] ?? (enMessages as Record<string, string>)[key] ?? key
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match))
}
