'use client'

// src/components/chat/pin-circles.tsx
//
// Four PIN circles. Empty = grey ring; filled = white ring with a white dot.
// One invisible input sits over the circles and does the typing, so paste,
// autofill and backspace behave like a normal field; tapping a circle focuses it.

import { useState } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  /** Used for the screen-reader label, e.g. "New PIN". */
  name: string
  autoFocus?: boolean
  inputRef?: React.Ref<HTMLInputElement>
  /** Called once when the 4th digit is entered, with the full PIN. */
  onComplete?: (pin: string) => void
  disabled?: boolean
  size?: number
}

export default function PinCircles({ value, onChange, name, autoFocus = false, inputRef, onComplete, disabled = false, size = 56 }: Props) {
  const [focused, setFocused] = useState(false)

  function handle(raw: string) {
    const next = raw.replace(/\D/g, '').slice(0, 4)
    const grew = next.length === 4 && value.length < 4
    onChange(next)
    if (grew) onComplete?.(next)
  }

  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', gap: 18 }}>
      {[0, 1, 2, 3].map(i => {
        const filled = value.length > i
        const active = focused && value.length === i
        return (
          <div
            key={i}
            aria-hidden
            style={{
              width: size, height: size, borderRadius: '50%', boxSizing: 'border-box',
              border: `2px solid ${filled ? 'var(--color-text-primary)' : active ? 'var(--color-text-secondary)' : 'var(--color-text-muted)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'border-color 0.12s',
            }}
          >
            {filled && <div style={{ width: size * 0.4, height: size * 0.4, borderRadius: '50%', background: 'var(--color-text-primary)' }} />}
          </div>
        )
      })}
      <input
        ref={inputRef}
        value={value}
        onChange={e => handle(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={`${name}, ${value.length} of 4 digits entered`}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          opacity: 0, cursor: 'pointer', border: 'none', background: 'none',
          fontSize: 16, // 16px stops iOS zooming in on focus
        }}
      />
    </div>
  )
}