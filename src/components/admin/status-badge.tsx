// src/components/admin/status-badge.tsx
const POSITIVE = new Set(['active', 'approved', 'completed', 'success', 'verified', 'unbanned', 'unsuspended'])
const WARNING  = new Set(['pending', 'pending_review', 'suspended', 'pending_verification'])
const NEGATIVE = new Set(['rejected', 'failed', 'banned', 'cancelled', 'reversed'])
const NEUTRAL  = new Set(['paused', 'reviewed', 'dismissed'])

function paletteFor(status: string): { bg: string; color: string } {
  const s = status.toLowerCase()
  if (POSITIVE.has(s)) return { bg: 'rgba(26,158,95,0.12)', color: '#1A9E5F' }
  if (WARNING.has(s))  return { bg: 'rgba(212,160,23,0.12)', color: '#D4A017' }
  if (NEGATIVE.has(s)) return { bg: 'rgba(229,57,53,0.12)', color: '#E53935' }
  if (NEUTRAL.has(s))  return { bg: 'rgba(55,138,221,0.12)', color: '#378ADD' }
  return { bg: 'rgba(120,120,120,0.12)', color: '#8A8A85' }
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const { bg, color } = paletteFor(status)
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 700,
      letterSpacing: '0.03em', background: bg, color,
      padding: '3px 9px', borderRadius: 6, whiteSpace: 'nowrap',
    }}>
      {(label || status).replace(/_/g, ' ').toUpperCase()}
    </span>
  )
}