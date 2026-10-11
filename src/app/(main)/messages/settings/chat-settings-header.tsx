'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export default function ChatSettingsHeader() {
  const router = useRouter()
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 10,
      backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
      borderBottom: '1px solid var(--color-border)',
      height: 56, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <button
        type="button" aria-label="Back"
        onClick={() => (window.history.length > 1 ? router.back() : router.replace('/messages'))}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', color: 'var(--color-text-primary)' }}
      >
        <ArrowLeft size={22} />
      </button>
      <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, margin: 0, color: 'var(--color-text-primary)' }}>
        Chat settings
      </h1>
    </div>
  )
}