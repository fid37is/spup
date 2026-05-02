'use client'

// src/app/(main)/explore/search-input.tsx
// Smart search bar:
//  - Submits on Enter
//  - Clear button when text present
//  - Detects hashtag input (#) and shows hint
//  - URL-driven: works correctly with browser back/fwd

import { Search, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useEffect } from 'react'

export default function ExploreSearchInput({ defaultValue }: { defaultValue: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultValue)

  // Sync when defaultValue changes (e.g. browser back)
  useEffect(() => { setValue(defaultValue) }, [defaultValue])

  // Auto-focus on mount (desktop only — skip on mobile to avoid keyboard pop)
  useEffect(() => {
    const isMobile = window.innerWidth < 768
    if (!isMobile && inputRef.current && !defaultValue) {
      inputRef.current.focus()
    }
  }, [defaultValue])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = value.trim()
    router.push(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore')
  }

  function handleClear() {
    setValue('')
    router.push('/explore')
    inputRef.current?.focus()
  }

  const isHashtag = value.startsWith('#')

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {/* Search icon */}
        <Search
          size={16}
          style={{
            position: 'absolute', left: 14,
            color: isHashtag ? 'var(--color-brand)' : 'var(--color-text-secondary)',
            pointerEvents: 'none', flexShrink: 0,
            transition: 'color 0.15s',
          }}
        />

        {/* Input */}
        <input
          ref={inputRef}
          name="q"
          type="search"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Search posts, people, #hashtags…"
          autoComplete="off"
          style={{
            width: '100%',
            background: 'var(--color-surface-2)',
            border: `1.5px solid ${isHashtag ? 'var(--color-brand-border)' : 'var(--color-border-light)'}`,
            borderRadius: 24,
            padding: `11px ${value ? '40px' : '16px'} 11px 42px`,
            color: 'var(--color-text-primary)',
            fontSize: 15,
            outline: 'none',
            fontFamily: "'DM Sans', sans-serif",
            WebkitAppearance: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
        />

        {/* Clear button */}
        {value && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              position: 'absolute', right: 12,
              background: 'var(--color-surface-3)',
              border: 'none', cursor: 'pointer',
              width: 22, height: 22, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-text-secondary)',
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Hashtag hint */}
      {isHashtag && (
        <p style={{ fontSize: 11, color: 'var(--color-brand)', marginTop: 6, paddingLeft: 14 }}>
          Searching by hashtag — press Enter to find posts tagged {value}
        </p>
      )}
    </form>
  )
}