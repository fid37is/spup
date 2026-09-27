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
