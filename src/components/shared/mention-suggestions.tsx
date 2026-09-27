'use client'

import type { MentionUser } from '@/lib/actions/mentions'

interface MentionSuggestionsProps {
  results: MentionUser[]
  activeIndex: number
  loading: boolean
  onHover: (index: number) => void
  onSelect: (username: string) => void
  /** 'below' (default) drops the list under the textarea; 'above' opens it
   *  upward instead - needed for reply-composer.tsx, which is pinned to the
   *  bottom of the viewport and has nowhere to drop down into. */
  placement?: 'below' | 'above'
}

export default function MentionSuggestions({
  results, activeIndex, loading, onHover, onSelect, placement = 'below',
}: MentionSuggestionsProps) {
  if (!loading && results.length === 0) return null

  return (
    <div
      role="listbox"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        ...(placement === 'below' ? { top: '100%', marginTop: 6 } : { bottom: '100%', marginBottom: 6 }),
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        maxHeight: 240,
        overflowY: 'auto',
        zIndex: 50,
      }}
    >
      {loading && results.length === 0 && (
        <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--color-text-muted)' }}>
          Searching…
        </div>
      )}
      {results.map((u, i) => (
        <div
          key={u.id}
          role="option"
          aria-selected={i === activeIndex}
          // onMouseDown (not onClick) + preventDefault so the textarea never
          // blurs when a suggestion is clicked - it keeps focus, and the
          // caret lands right where selectUser() puts it.
          onMouseDown={e => { e.preventDefault(); onSelect(u.username) }}
          onMouseEnter={() => onHover(i)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
            cursor: 'pointer',
            background: i === activeIndex ? 'var(--color-surface-2)' : 'transparent',
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
            background: u.avatar_url ? undefined : 'linear-gradient(135deg, var(--color-brand-dim), var(--color-brand))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 12, color: 'white',
          }}>
            {u.avatar_url
              ? <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : u.display_name.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {u.display_name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>@{u.username}</div>
          </div>
        </div>
      ))}
    </div>
  )
}