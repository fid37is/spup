'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Check } from 'lucide-react'

export default function SortMenu({ postId, currentSort, tab }: { postId: string; currentSort: 'recent' | 'top'; tab: 'likes' | 'quotes' }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  function select(sort: 'recent' | 'top') {
    setOpen(false)
    router.push(`/post/${postId}/activity?tab=${tab}&sort=${sort}`)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-primary)', fontSize: 15, fontWeight: 600,
          fontFamily: "'DM Sans',sans-serif", padding: '6px 4px',
        }}
      >
        Sort <ChevronDown size={15} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 40,
            background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
            borderRadius: 14, padding: 6, minWidth: 160,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}>
            {(['top', 'recent'] as const).map(opt => (
              <button
                key={opt}
                onClick={() => select(opt)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '10px 14px', background: 'none', border: 'none',
                  borderRadius: 8, cursor: 'pointer', fontSize: 14,
                  color: 'var(--color-text-primary)', fontFamily: "'DM Sans',sans-serif",
                }}
              >
                {opt === 'top' ? 'Top' : 'Recent'}
                {currentSort === opt && <Check size={14} color="var(--color-brand)" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
