'use client'

import { createContext, useContext, useCallback, useMemo, useState } from 'react'
import { type Locale, DEFAULT_LOCALE, loadDictionary } from './dictionaries'
// Static import (not dynamic) — this is the fallback dictionary and must be
// available synchronously on every render, regardless of the active locale.
import enMessages from '@/locales/en.json'

interface LanguageContextValue {
  locale: Locale
  t: (key: string, vars?: Record<string, string | number>) => string
  setLocale: (next: Locale) => void
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: DEFAULT_LOCALE,
  // Fallback used only if a component calls useTranslation() outside the
  // provider (e.g. a shared component that's also rendered on a route not
  // wrapped in LanguageProvider yet, like (auth) pages). Falls back to the
  // real English string, not the raw key — so a missing Provider degrades
  // to "shows English" instead of "shows literal key names like
  // post.delete_confirm" on screen.
  t: key => (enMessages as Record<string, string>)[key] ?? key,
  setLocale: () => {},
})

export function useTranslation() {
  return useContext(LanguageContext)
}

function interpolate(str: string, vars?: Record<string, string | number>) {
  if (!vars) return str
  return str.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match))
}

export function LanguageProvider({
  initialLocale,
  initialMessages,
  children,
}: {
  // Read once, server-side, from the logged-in user's saved
  // language_preference (see (main)/layout.tsx) — so the very first paint
  // already reflects their choice, with no client fetch and no flash of
  // English while a dictionary loads.
  initialLocale: Locale
  initialMessages: Record<string, string>
  children: React.ReactNode
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const [messages, setMessages] = useState<Record<string, string>>(initialMessages)

  // Only updates in-memory state + swaps the loaded dictionary. Persisting
  // the choice (updateProfileAction) is the caller's job — see
  // settings-client.tsx's handleLang — so this context stays decoupled from
  // any particular save mechanism (settings today, signup/onboarding later).
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    loadDictionary(next).then(setMessages).catch(() => {
      // Swap failed (offline, bad chunk) — stay on whatever dictionary was
      // already loaded rather than leaving `messages` and `locale` mismatched.
      setLocaleState(locale)
    })
  }, [locale])

  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    const raw = messages[key] ?? (enMessages as Record<string, string>)[key] ?? key
    return interpolate(raw, vars)
  }, [messages])

  const value = useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}
