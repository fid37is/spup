// src/components/ui/verified-badge.tsx
/**
 * Unified verification badge component — the ONLY place a verification
 * badge should be rendered anywhere in the app. One shape everywhere
 * (checkmark in a filled circle, matching X's badge), tier only changes
 * the fill color. No per-tier shape/border/shadow variants - that's what
 * made the 'spup' tier look like a different badge entirely (flat "S"
 * letter, white ring, drop shadow) instead of the same mark in gold.
 *
 * Tiers:
 *   standard     — BVN verified user                              → green
 *   pioneer      — One of first 200 accounts, phone+BVN verified  → gold
 *   creator      — Verified creator                                → brand
 *   organisation — Verified organisation                           → gold
 *   spup         — Internal team (permanent)                       → gold
 *   none / other — nothing rendered
 */
import { BadgeCheck } from 'lucide-react'

interface VerifiedBadgeProps {
  tier: string
  size?: number
}

const CONFIG: Record<string, { bg: string; title: string }> = {
  standard:     { bg: '#22C55E',                                    title: 'BVN Verified'                         },
  pioneer:      { bg: 'linear-gradient(135deg, #D4A017, #F5C842)',   title: 'Pioneer — among the first 200 on Spup' },
  creator:      { bg: 'var(--color-brand)',                         title: 'Verified Creator'                     },
  organisation: { bg: '#D4A017',                                    title: 'Verified Organisation'                },
  spup:         { bg: '#D4A017',                                    title: 'Spup Team'                            },
}

export default function VerifiedBadge({ tier, size = 15 }: VerifiedBadgeProps) {
  const cfg = CONFIG[tier]
  if (!cfg) return null

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