'use client'

import { useState } from 'react'
import { useToast } from '@/components/layout/toast'

const TIERS = [
  { id: 'boost',     label: 'Boost',     price: '₦500',   duration: '24 hours' },
  { id: 'spotlight', label: 'Spotlight', price: '₦2,000', duration: '3 days' },
  { id: 'feature',   label: 'Feature',   price: '₦5,000', duration: '7 days' },
] as const

export default function PromoteModal({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [selected, setSelected] = useState<typeof TIERS[number]['id']>('boost')
  const [loading, setLoading] = useState(false)
  const { error: toastError } = useToast()

  async function handlePromote() {
    setLoading(true)
    try {
      const res = await fetch('/api/promotions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, tier: selected }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error || 'Could not start promotion')
        setLoading(false)
        return
      }
      window.location.href = data.authorization_url
    } catch {
      toastError('Could not start promotion')
      setLoading(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--color-surface)', borderRadius: 16, padding: 24, width: 360, border: '1px solid var(--color-border)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, marginBottom: 6, color: 'var(--color-text)' }}>
          Promote this post
        </h3>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16 }}>
          Get shown to more people outside your followers.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {TIERS.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 14px', borderRadius: 10, textAlign: 'left',
                border: selected === t.id ? '1.5px solid #1A9E5F' : '1px solid var(--color-border)',
                background: selected === t.id ? 'rgba(26,158,95,0.06)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>{t.label}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t.duration}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A9E5F' }}>{t.price}</div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '10px 0', borderRadius: 20, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handlePromote}
            disabled={loading}
            style={{ flex: 1, padding: '10px 0', borderRadius: 20, border: 'none', background: '#1A9E5F', color: '#fff', fontWeight: 600, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Redirecting…' : 'Pay & promote'}
          </button>
        </div>
      </div>
    </div>
  )
}