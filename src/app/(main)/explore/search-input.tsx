'use client'

// src/app/(main)/explore/search-input.tsx

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'

export default function ExploreSearchInput({ defaultValue }: { defaultValue: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = inputRef.current?.value.trim() || ''
    router.push(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore')
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ position: 'relative' }}>
        <Search size={16} style={{
          position: 'absolute', left: 14, top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--color-text-secondary)', pointerEvents: 'none',
        }} />
        <input
          ref={inputRef}
          name="q"
          type="search"
          defaultValue={defaultValue}
          placeholder="Search posts, people, #hashtags…"
          autoFocus
          autoComplete="off"
          style={{
            width: '100%',
            background: 'var(--color-surface-2)',
            border: '1.5px solid var(--color-border-light)',
            borderRadius: 24,
            padding: '11px 16px 11px 42px',
            color: 'var(--color-text-primary)',
            fontSize: 15,
            outline: 'none',
            fontFamily: "'DM Sans', sans-serif",
            WebkitAppearance: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
    </form>
  )
}