'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/layout/toast'

const TIERS = [
  { id: 'boost',     label: 'Boost',     price: '₦500',   duration: '24 hours' },
  { id: 'spotlight', label: 'Spotlight', price: '₦2,000', duration: '3 days' },
  { id: 'feature',   label: 'Feature',   price: '₦5,000', duration: '7 days' },
] as const

export default function PromoteModal({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [selected, setSelected] = useState<typeof TIERS[number]['id']>('boost')
  const [promoCode, setPromoCode] = useState('')
  const [showCodeInput, setShowCodeInput] = useState(false)
  const [loading, setLoading] = useState(false)
  const { success, error: toastError } = useToast()
  const router = useRouter()
  // Portaled to document.body below — see the note on ConfirmModal for why.
  // (This modal's zIndex was also previously 100, identical to the mobile
  // bottom nav's — a tie that let DOM order decide, and the nav always won.)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  async function handlePromote() {
    setLoading(true)
    try {
      const trimmedCode = promoCode.trim()
      const res = await fetch('/api/promotions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, tier: selected, promo_code: trimmedCode || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error || 'Could not start promotion')
        setLoading(false)
        return
      }
      if (data.authorization_url) {
        window.location.href = data.authorization_url
        return
      }
      // Activated directly via a redeemed promo code - there's nowhere to
      // redirect to (no payment happened). A tier-locked code overrides
      // whichever tier was selected, so confirm whichever one was actually
      // granted rather than assuming it matches `selected`.
      const grantedTier = TIERS.find(t => t.id === data.tier) ?? TIERS.find(t => t.id === selected)
      success(grantedTier ? `${grantedTier.label} promotion activated` : 'Promotion activated')
      setLoading(false)
      onClose()
      router.refresh()
    } catch {
      toastError('Could not start promotion')
      setLoading(false)
    }
  }

  return (!mounted) ? null : createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
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

        {showCodeInput ? (
          <div style={{ marginBottom: 16 }}>
            <input
              value={promoCode}
              onChange={e => setPromoCode(e.target.value)}
              placeholder="Enter promo code"
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
                border: '1px solid var(--color-border)', background: 'var(--input-bg)',
                color: 'var(--color-text)', fontSize: 14, letterSpacing: '0.05em', textTransform: 'uppercase',
              }}
            />
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', margin: '6px 0 0' }}>
              A valid code activates this promotion directly - no payment needed.
            </p>
          </div>
        ) : (
          <button
            onClick={() => setShowCodeInput(true)}
            style={{ background: 'none', border: 'none', padding: 0, marginBottom: 16, cursor: 'pointer', fontSize: 12.5, color: 'var(--color-text-muted)', textDecoration: 'underline' }}
          >
            Have a promo code?
          </button>
        )}

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
            {loading ? (promoCode.trim() ? 'Applying…' : 'Redirecting…') : (promoCode.trim() ? 'Apply code & promote' : 'Pay & promote')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}