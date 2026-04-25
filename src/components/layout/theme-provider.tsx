'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {},
  toggle: () => {},
})

export function useTheme() { return useContext(ThemeContext) }

const STYLE = `
  #theme-snapshot {
    position: fixed;
    inset: 0;
    z-index: 99999;
    pointer-events: none;
    will-change: clip-path;
  }
  #theme-snapshot.slide-up {
    animation: snap-up 0.65s cubic-bezier(0.76, 0, 0.24, 1) forwards;
  }
  #theme-snapshot.slide-down {
    animation: snap-down 0.65s cubic-bezier(0.76, 0, 0.24, 1) forwards;
  }
  @keyframes snap-up {
    from { clip-path: inset(0 0 0 0); }
    to   { clip-path: inset(0 0 100% 0); }
  }
  @keyframes snap-down {
    from { clip-path: inset(0 0 0 0); }
    to   { clip-path: inset(100% 0 0 0); }
  }
`

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')
  const animatingRef = useRef(false)

  useEffect(() => {
    if (!document.getElementById('theme-anim-style')) {
      const s = document.createElement('style')
      s.id = 'theme-anim-style'
      s.textContent = STYLE
      document.head.appendChild(s)
    }
    const current = document.documentElement.getAttribute('data-theme') as Theme
    if (current === 'light') setThemeState('light')
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('spup-theme', next) } catch {}
  }, [])

  const toggle = useCallback(() => {
    if (animatingRef.current) return
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    animatingRef.current = true

    // 1. Screenshot the current theme into a canvas
    import('html2canvas').then(({ default: html2canvas }) => {
      html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        scale: window.devicePixelRatio,
        logging: false,
      }).then(canvas => {
        // 2. Slap the canvas screenshot as a fixed overlay — covers the page
        const snap = document.createElement('div')
        snap.id = 'theme-snapshot'
        snap.style.cssText = `
          background: url(${canvas.toDataURL()}) top left / 100% auto no-repeat;
        `
        document.body.appendChild(snap)

        // 3. Switch theme immediately underneath the snapshot
        setTheme(next)

        // 4. Animate the snapshot away in the right direction
        //    dark→light: snapshot (old dark) slides UP, revealing light beneath
        //    light→dark: snapshot (old light) slides DOWN, revealing dark beneath
        void snap.offsetWidth
        snap.classList.add(next === 'light' ? 'slide-up' : 'slide-down')

        // 5. Cleanup
        setTimeout(() => {
          snap.remove()
          animatingRef.current = false
        }, 680)
      })
    }).catch(() => {
      // html2canvas not available — fall back to instant switch
      setTheme(next)
      animatingRef.current = false
    })
  }, [theme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
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