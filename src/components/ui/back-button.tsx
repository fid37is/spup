// src/components/ui/back-button.tsx
'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

type Variant = 'header' | 'banner' | 'bare'

const VARIANT_STYLE: Record<Variant, CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    borderRadius: '50%',
    color: 'var(--color-text-primary)',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    flexShrink: 0,
  },
  banner: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 2,
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.45)',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  bare: {
    color: 'var(--color-text-primary)',
    display: 'flex',
    alignItems: 'center',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
  },
}

interface BackButtonProps {
  fallbackHref?: string
  label?: string
  variant?: Variant
  iconSize?: number
  iconColor?: string
  style?: CSSProperties
  children?: ReactNode
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
}

/**
 * Prefer history.back(); never Link-push a parent (that causes loops).
 * If opened directly, replace(fallbackHref).
 */
export default function BackButton({
  fallbackHref = '/feed',
  label = 'Back',
  variant = 'header',
  iconSize = 20,
  iconColor,
  style,
  children,
  onClick,
}: BackButtonProps) {
  const router = useRouter()

  function handleBack(e: React.MouseEvent<HTMLButtonElement>) {
    onClick?.(e)
    if (e.defaultPrevented) return

    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.replace(fallbackHref)
  }

  const resolvedColor =
    iconColor ?? (variant === 'banner' ? 'white' : 'var(--color-text-primary)')

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={label}
      style={{ ...VARIANT_STYLE[variant], ...style }}
    >
      {children ?? (
        <ArrowLeft
          size={iconSize}
          color={variant === 'banner' ? resolvedColor : undefined}
          strokeWidth={variant === 'banner' ? 2.2 : undefined}
        />
      )}
    </button>
  )
}