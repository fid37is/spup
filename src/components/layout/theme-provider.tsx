'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'

type Theme = 'dark' | 'light'
// The user's actual stored choice. 'system' means "keep following the OS",
// as opposed to 'light'/'dark' which are an explicit override.
type ThemePreference = Theme | 'system'

interface ThemeContextValue {
  theme: Theme
  preference: ThemePreference
  setPreference: (p: ThemePreference) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  preference: 'system',
  setPreference: () => {},
  toggle: () => {},
})

export function useTheme() { return useContext(ThemeContext) }

const STORAGE_KEY = 'spup-theme'

function systemPrefersLight() {
  return typeof window !== 'undefined' && !!window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: light)').matches
}

// Turn a stored preference into the concrete theme that actually gets
// painted. Kept as one function so the provider and the pre-hydration
// script in app/layout.tsx can't drift out of sync with each other.
function resolvePreference(pref: ThemePreference): Theme {
  return pref === 'system' ? (systemPrefersLight() ? 'light' : 'dark') : pref
}

const STYLE = `
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation: none;
    mix-blend-mode: normal;
  }
  ::view-transition-new(root) { z-index: 1; }
  ::view-transition-old(root) { z-index: 2; }

  html[data-theme-direction="up"]::view-transition-old(root) {
    animation: curtain-up 0.5s cubic-bezier(0.76, 0, 0.24, 1) forwards;
  }
  html[data-theme-direction="down"]::view-transition-old(root) {
    animation: curtain-down 0.5s cubic-bezier(0.76, 0, 0.24, 1) forwards;
  }
  @keyframes curtain-up {
    from { clip-path: inset(0 0 0 0); }
    to   { clip-path: inset(0 0 100% 0); }
  }
  @keyframes curtain-down {
    from { clip-path: inset(0 0 0 0); }
    to   { clip-path: inset(100% 0 0 0); }
  }
`

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  // Read the attribute the pre-hydration inline script (root layout.tsx)
  // already set on <html>, instead of always starting from 'dark' -
  // otherwise the toggle icon itself flashed to the wrong state for a frame,
  // on top of the page-level flash that script fixes. That script now runs
  // on every route (this provider is mounted once at the app root), so this
  // stays correct across client-side navigations too, not just hard loads.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document === 'undefined') return 'dark'
    return (document.documentElement.getAttribute('data-theme') as Theme) || 'dark'
  })
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    if (typeof document === 'undefined') return 'system'
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
    } catch {}
    return 'system'
  })
  const animatingRef = useRef(false)

  const applyResolved = useCallback((resolved: Theme) => {
    setThemeState(resolved)
    document.documentElement.setAttribute('data-theme', resolved)
  }, [])

  useEffect(() => {
    if (!document.getElementById('theme-anim-style')) {
      const s = document.createElement('style')
      s.id = 'theme-anim-style'
      s.textContent = STYLE
      document.head.appendChild(s)
    }
  }, [])

  // Keeps the painted theme in sync with the OS while preference is
  // 'system' - without this, picking "System" only matches the OS at the
  // moment it was picked, and silently goes stale if the OS theme changes.
  useEffect(() => {
    if (preference !== 'system' || typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => applyResolved(resolvePreference('system'))
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [preference, applyResolved])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch {}
    applyResolved(resolvePreference(next))
  }, [applyResolved])

  const toggle = useCallback(() => {
    if (animatingRef.current) return
    // The quick icon toggle always lands on an explicit light/dark choice,
    // never back on 'system' - clicking it means "no, I want it THIS way",
    // not "go recompute what my OS thinks".
    const next: Theme = theme === 'dark' ? 'light' : 'dark'

    // Native View Transitions API — no screenshotting, so no CORS/tainted-
    // canvas failure mode (which is what silently killed the old
    // html2canvas-based animation whenever a cross-origin image, like a
    // Cloudinary avatar, was on screen). Falls back to an instant switch on
    // browsers that don't support it yet.
    if (typeof document.startViewTransition !== 'function') {
      setPreference(next)
      return
    }

    animatingRef.current = true
    // dark→light: old (dark) view curtains UP, revealing light beneath
    // light→dark: old (light) view curtains DOWN, revealing dark beneath
    document.documentElement.setAttribute('data-theme-direction', next === 'light' ? 'up' : 'down')

    try {
      const transition = document.startViewTransition(() => {
        setPreference(next)
      })

      const reset = () => {
        document.documentElement.removeAttribute('data-theme-direction')
        animatingRef.current = false
      }

      transition.finished.catch(() => {}).finally(reset)
      // Belt-and-braces: force-reset even if `finished` never settles for
      // some unforeseen reason, so the toggle can never get stuck for good.
      setTimeout(reset, 1200)
    } catch {
      // startViewTransition can throw synchronously (e.g. another transition
      // already in progress, document not fully active). Without this catch,
      // animatingRef stays true forever and every future click on this
      // button silently no-ops until a full page refresh — which is exactly
      // the "toggle works inconsistently" symptom.
      document.documentElement.removeAttribute('data-theme-direction')
      animatingRef.current = false
      setPreference(next)
    }
  }, [theme, setPreference])

  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className={className}
      style={{
        width: 36, height: 36,
        borderRadius: '50%',
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface-2)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--color-text-secondary)',
        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--color-surface-3)'
        e.currentTarget.style.color = 'var(--color-text-primary)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--color-surface-2)'
        e.currentTarget.style.color = 'var(--color-text-secondary)'
      }}
    >
      {theme === 'dark' ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  )
}