// src/app/(main)/wallet/topup-button.tsx
import Link from 'next/link'
import { Plus } from 'lucide-react'

export default function TopUpButton() {
  return (
    <Link
      href="/wallet/topup"
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        background: 'var(--color-surface-2)', color: 'var(--color-text-primary)',
        border: '1px solid var(--color-border)', borderRadius: 10, padding: '11px 20px',
        fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
        textDecoration: 'none', whiteSpace: 'nowrap',
      }}
    >
      <Plus size={16} />
      Top up
    </Link>
  )
}
