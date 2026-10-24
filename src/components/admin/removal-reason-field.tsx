'use client'

// src/components/admin/removal-reason-field.tsx
//
// The "why is this post being removed?" box. Whatever is typed here is sent to the post's
// author as a notification, so it is required (see lib/admin/removal-reasons.ts).

import { REMOVAL_REASON_MAX, REMOVAL_REASON_MIN, REMOVAL_REASON_PRESETS } from '@/lib/admin/removal-reasons'

export function isRemovalReasonValid(reason: string): boolean {
  const len = reason.replace(/\s+/g, ' ').trim().length
  return len >= REMOVAL_REASON_MIN && len <= REMOVAL_REASON_MAX
}

export default function RemovalReasonField({
  value, onChange, disabled,
}: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="w-full">
      <p className="mb-1.5 text-[11px] font-semibold text-secondary">
        REASON <span className="font-normal text-faint">- the author will see this</span>
      </p>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {REMOVAL_REASON_PRESETS.map(p => (
          <button
            key={p.label}
            type="button"
            disabled={disabled}
            onClick={() => onChange(p.text)}
            className="rounded-full border border-border bg-[color:var(--color-surface-2)] px-2.5 py-1 text-[11px] text-secondary disabled:opacity-60"
          >
            {p.label}
          </button>
        ))}
      </div>

      <textarea
        value={value}
        onChange={e => onChange(e.target.value.slice(0, REMOVAL_REASON_MAX))}
        disabled={disabled}
        rows={3}
        placeholder="Tell the author why this post is being removed…"
        className="w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-2 text-xs text-primary outline-none"
      />
      <p className="mt-1 text-right text-[10px] text-faint">{value.length}/{REMOVAL_REASON_MAX}</p>
    </div>
  )
}
