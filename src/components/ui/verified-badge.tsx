// src/components/ui/verified-badge.tsx
/**
 * Unified verification badge component - the ONLY place a verification
 * badge should be rendered anywhere in the app. One shape everywhere (the
 * scalloped seal with a checkmark, the same mark X and other platforms use),
 * tier only changes the fill color. No per-tier shape/border/shadow variants.
 *
 * Tiers:
 *   standard     - BVN verified user                              -> green
 *   pioneer      - One of first 200 accounts, phone+BVN verified  -> gold (gradient)
 *   creator      - Verified creator                               -> brand
 *   organisation - Verified organisation                          -> gold
 *   spup         - Internal team (permanent)                      -> gold
 *   none / other - nothing rendered
 */
import { useId } from 'react'

interface VerifiedBadgeProps {
  tier: string
  size?: number
}

interface TierStyle {
  fill: string
  /** Optional gradient (from -> to) instead of a flat fill. */
  gradient?: [string, string]
  title: string
}

const CONFIG: Record<string, TierStyle> = {
  standard:     { fill: '#22C55E',                                                              title: 'BVN Verified' },
  pioneer:      { fill: 'var(--color-gold)', gradient: ['var(--color-gold)', 'var(--color-gold-light)'], title: 'Pioneer \u2014 among the first 200 on Spup' },
  creator:      { fill: 'var(--color-brand)',                                                   title: 'Verified Creator' },
  organisation: { fill: 'var(--color-gold)',                                                    title: 'Verified Organisation' },
  spup:         { fill: 'var(--color-gold)',                                                    title: 'Spup Team' },
}

// 8-lobed scalloped seal, centred in a 24x24 box (kept compact because one
// is rendered next to every verified author in a feed).
const SEAL_PATH =
  'M22.9 12C22.9 13.4 21.13 14.27 20.59 15.56C20.06 16.85 20.7 18.72 19.71 19.71C18.72 20.7 16.85 20.06 15.56 20.59C14.27 21.13 13.4 22.9 12 22.9C10.6 22.9 9.73 21.13 8.44 20.59C7.15 20.06 5.28 20.7 4.29 19.71C3.3 18.72 3.94 16.85 3.41 15.56C2.87 14.27 1.1 13.4 1.1 12C1.1 10.6 2.87 9.73 3.41 8.44C3.94 7.15 3.3 5.28 4.29 4.29C5.28 3.3 7.15 3.94 8.44 3.41C9.73 2.87 10.6 1.1 12 1.1C13.4 1.1 14.27 2.87 15.56 3.41C16.85 3.94 18.72 3.3 19.71 4.29C20.7 5.28 20.06 7.15 20.59 8.44C21.13 9.73 22.9 10.6 22.9 12Z'

export default function VerifiedBadge({ tier, size = 15 }: VerifiedBadgeProps) {
  // Must run before the early return below. Stripped to plain characters so
  // it is safe inside url(#...) whatever format useId produces.
  const gradientId = `vb-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const cfg = CONFIG[tier]
  if (!cfg) return null

  return (
    <span
      title={cfg.title}
      style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0 }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        role="img"
        aria-label={cfg.title}
        style={{ display: 'block' }}
      >
        {cfg.gradient && (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" style={{ stopColor: cfg.gradient[0] }} />
              <stop offset="1" style={{ stopColor: cfg.gradient[1] }} />
            </linearGradient>
          </defs>
        )}
        <path
          d={SEAL_PATH}
          fill={cfg.gradient ? `url(#${gradientId})` : undefined}
          style={cfg.gradient ? undefined : { fill: cfg.fill }}
        />
        <path
          d="M7.3 12.3l3.4 3.4 6.1-6.9"
          fill="none"
          stroke="white"
          strokeWidth={2.3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}