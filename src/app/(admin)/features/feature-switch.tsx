'use client'

// src/app/(admin)/features/feature-switch.tsx
//
// One on/off row on the Feature switches page.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminSetFeatureFlagAction } from '@/lib/actions/admin'

interface FeatureSwitchProps {
  flagKey: string
  label: string
  description: string
  onText: string
  offText: string
  initialValue: boolean
}

export default function FeatureSwitch({ flagKey, label, description, onText, offText, initialValue }: FeatureSwitchProps) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function toggle() {
    const next = !value
    setError(null)
    setValue(next)                       // shown at once; put back if the save fails
    startTransition(async () => {
      const result = await adminSetFeatureFlagAction(flagKey, next)
      if (result?.error) { setValue(!next); setError(result.error); return }
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-display text-sm font-bold text-primary">{label}</div>
          <p className="mt-1 text-[12px] leading-relaxed text-faint">{description}</p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-label={label}
          onClick={toggle}
          disabled={isPending}
          className="relative h-[26px] w-[46px] shrink-0 rounded-full border-0 transition-colors disabled:opacity-60"
          style={{ background: value ? 'var(--color-brand)' : 'var(--color-surface-3)', cursor: 'pointer' }}
        >
          <span
            className="absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all"
            style={{ left: value ? 23 : 3 }}
          />
        </button>
      </div>

      <p className={`mt-3 rounded-lg px-3 py-2 text-[12px] leading-relaxed ${value ? 'bg-brand-muted text-brand' : 'bg-[color:var(--color-surface-2)] text-secondary'}`}>
        {value ? onText : offText}
      </p>

      {error && <p className="mt-2 text-[12px] text-error">{error}</p>}
    </div>
  )
}
