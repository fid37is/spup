// src/components/ui/verified-badge.tsx
/**
 * Unified verification badge component.
 *
 * Tiers:
 *   standard     — BVN verified user         → green BadgeCheck
 *   creator      — Verified creator           → brand BadgeCheck
 *   organisation — Verified organisation      → gold BadgeCheck
 *   spup         — Internal team (permanent)  → gold "S" badge
 *   none / other — nothing rendered
 */
import { BadgeCheck } from 'lucide-react'

interface VerifiedBadgeProps {
  tier: string
  size?: number
}

const CONFIG: Record<string, { bg: string; title: string }> = {
  standard:     { bg: '#22C55E',           title: 'BVN Verified'          },
  creator:      { bg: 'var(--color-brand)', title: 'Verified Creator'      },
  organisation: { bg: '#D4A017',           title: 'Verified Organisation'  },
  spup:         { bg: '#D4A017',           title: 'Spup Team'              },
}

export default function VerifiedBadge({ tier, size = 16 }: VerifiedBadgeProps) {
  const cfg = CONFIG[tier]
  if (!cfg) return null

  // Spup internal team — gold "S" badge, distinct from all others
  if (tier === 'spup') {
    return (
      <span
        title="Spup Team"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: size, height: size, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #D4A017, #F5C842)',
          border: '1.5px solid rgba(255,255,255,0.5)',
          fontSize: size * 0.55, fontWeight: 900,
          color: '#000', fontFamily: "'Syne', sans-serif",
          boxShadow: '0 0 0 1.5px #D4A017',
        }}
      >
        S
      </span>
    )
  }

  return (
    <span
      title={cfg.title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: cfg.bg,
      }}
    >
      <BadgeCheck size={size * 0.72} color="white" strokeWidth={2.5} />
    </span>
  )
}