'use client'

import { useState, useRef, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, X } from 'lucide-react'

interface SchedulePickerProps {
  value: string | null            // ISO string, or null if not scheduled
  onChange: (iso: string | null) => void
  disabled?: boolean
}

// Local Date -> the string an <input type="datetime-local"> wants (no
// timezone, minute precision), and back. Everything here works in the
// viewer's own local time; onChange always emits a real ISO/UTC string.
function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function addMinutes(base: Date, mins: number) {
  return new Date(base.getTime() + mins * 60_000)
}

function nextMorning(base: Date, hour: number) {
  const d = new Date(base)
  d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  return d
}

function formatScheduled(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    year: sameYear ? undefined : 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function SchedulePicker({ value, onChange, disabled }: SchedulePickerProps) {
  const [open, setOpen] = useState(false)
  const [draftValue, setDraftValue] = useState('')
  const [error, setError] = useState('')
  const [coords, setCoords] = useState<{ top: number; left: number; openUpward: boolean } | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const POPOVER_WIDTH = 260
  const POPOVER_HEIGHT_EST = 320

  useLayoutEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const handleMqChange = () => setIsMobile(mq.matches)
    mq.addEventListener('change', handleMqChange)
    return () => mq.removeEventListener('change', handleMqChange)
  }, [])

  // The trigger usually lives inside a modal/sheet with `overflow: hidden`
  // and its own stacking context (see the portal notes on PostModal and
  // floating-compose-btn.tsx) - a plain `position: absolute` popover gets
  // clipped by that ancestor instead of floating free. Portaling to <body>
  // and computing fixed coordinates from the trigger's own bounding box
  // sidesteps both problems entirely. Desktop only - on mobile this renders
  // as a full-width bottom sheet instead (see below), which doesn't need a
  // trigger-relative position at all.
  const reposition = useCallback(() => {
    if (isMobile) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const openUpward = rect.top > POPOVER_HEIGHT_EST || rect.top > window.innerHeight - rect.bottom
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - POPOVER_WIDTH - 8)
    const top = openUpward ? rect.top - 8 : rect.bottom + 8
    setCoords({ top, left, openUpward })
  }, [isMobile])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
    const initial = value ? new Date(value) : addMinutes(new Date(), 60)
    setDraftValue(toLocalInputValue(initial))
    setError('')
    if (isMobile) return
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, value, reposition, isMobile])

  useLayoutEffect(() => {
    if (!open || isMobile) return  // mobile closes via its own backdrop tap instead
    function onClick(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open, isMobile])

  function applyPreset(date: Date) {
    setDraftValue(toLocalInputValue(date))
    setError('')
  }

  function confirm() {
    if (!draftValue) { setError('Pick a date and time'); return }
    const chosen = new Date(draftValue)
    if (isNaN(chosen.getTime())) { setError('Pick a valid date and time'); return }
    if (chosen.getTime() < Date.now() + 4 * 60 * 1000) { setError('Pick a time at least 5 minutes from now'); return }
    onChange(chosen.toISOString())
    setOpen(false)
  }

  function clear() {
    onChange(null)
    setOpen(false)
  }

  return (
    <div style={{ display: 'inline-flex' }}>
      {value ? (
        // Scheduled pill — shows the chosen time, click to change it
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(v => !v)}
          disabled={disabled}
          title="Change or remove scheduled time"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--color-brand-muted)', color: 'var(--color-brand)',
            border: '1px solid var(--color-brand-dim)', borderRadius: 16,
            padding: '5px 10px', fontSize: 12.5, fontWeight: 700,
            cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          <Calendar size={13} />
          {formatScheduled(value)}
          <span
            role="button"
            aria-label="Remove scheduled time"
            onClick={e => { e.stopPropagation(); clear() }}
            style={{ display: 'flex', marginLeft: 2 }}
          >
            <X size={12} />
          </span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(v => !v)}
          disabled={disabled}
          title="Schedule for later"
          aria-label="Schedule for later"
          style={{
            width: 36, height: 36, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            color: disabled ? 'var(--color-text-faint)' : 'var(--color-brand)',
            borderRadius: 8, transition: 'background 0.12s',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Calendar size={18} />
        </button>
      )}

      {open && isMobile && createPortal(
        <>
          <style>{`
            @keyframes schedFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes schedSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
          `}</style>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'var(--overlay-bg)', animation: 'schedFadeIn 0.15s ease' }}
          />
          <div
            ref={popoverRef}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 501,
              maxHeight: '85vh', overflowY: 'auto',
              background: 'var(--color-surface-raised)',
              borderRadius: '18px 18px 0 0',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.35)',
              padding: '14px 16px calc(16px + env(safe-area-inset-bottom))',
              animation: 'schedSlideUp 0.2s ease',
            }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)', margin: '0 auto 14px' }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 12px', fontFamily: "'Syne', sans-serif" }}>
              Schedule post
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              <PresetBtn label="In 1 hour" onClick={() => applyPreset(addMinutes(new Date(), 60))} />
              <PresetBtn label="Tomorrow morning · 9:00 AM" onClick={() => applyPreset(nextMorning(new Date(), 9))} />
            </div>

            <label style={{ display: 'block', fontSize: 12.5, color: 'var(--color-text-faint)', marginBottom: 6 }}>
              Or pick a date &amp; time
            </label>
            <input
              type="datetime-local"
              value={draftValue}
              onChange={e => { setDraftValue(e.target.value); setError('') }}
              style={{
                width: '100%', background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)', borderRadius: 10,
                padding: '12px 10px', fontSize: 15, color: 'var(--color-text-primary)',
                fontFamily: "'DM Sans', sans-serif", marginBottom: 10,
              }}
            />

            {error && (
              <p style={{ fontSize: 13, color: 'var(--color-error)', margin: '0 0 10px' }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              {value && (
                <button type="button" onClick={clear} style={{ ...secondaryBtnStyle, flex: 1, textAlign: 'center', padding: '11px' }}>
                  Remove
                </button>
              )}
              <button type="button" onClick={confirm} style={{ ...primaryBtnStyle, flex: 1, textAlign: 'center', padding: '11px', borderRadius: 10 }}>
                Confirm
              </button>
            </div>
          </div>
        </>,
        document.body
      )}

      {open && !isMobile && coords && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: 'fixed', zIndex: 500, width: POPOVER_WIDTH,
            top: coords.openUpward ? undefined : coords.top,
            bottom: coords.openUpward ? window.innerHeight - coords.top : undefined,
            left: coords.left,
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)', borderRadius: 14,
            boxShadow: '0 12px 32px rgba(0,0,0,0.35)', padding: 14,
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 10px', fontFamily: "'Syne', sans-serif" }}>
            Schedule post
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            <PresetBtn label="In 1 hour" onClick={() => applyPreset(addMinutes(new Date(), 60))} />
            <PresetBtn label="Tomorrow morning · 9:00 AM" onClick={() => applyPreset(nextMorning(new Date(), 9))} />
          </div>

          <label style={{ display: 'block', fontSize: 11.5, color: 'var(--color-text-faint)', marginBottom: 4 }}>
            Or pick a date &amp; time
          </label>
          <input
            type="datetime-local"
            value={draftValue}
            onChange={e => { setDraftValue(e.target.value); setError('') }}
            style={{
              width: '100%', background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)', borderRadius: 8,
              padding: '7px 8px', fontSize: 13, color: 'var(--color-text-primary)',
              fontFamily: "'DM Sans', sans-serif", marginBottom: 8,
            }}
          />

          {error && (
            <p style={{ fontSize: 12, color: 'var(--color-error)', margin: '0 0 8px' }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {value && (
              <button type="button" onClick={clear} style={secondaryBtnStyle}>
                Remove
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} style={secondaryBtnStyle}>
              Cancel
            </button>
            <button type="button" onClick={confirm} style={primaryBtnStyle}>
              Confirm
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function PresetBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left', background: 'var(--color-surface-2)', border: 'none',
        borderRadius: 8, padding: '7px 9px', fontSize: 12.5, color: 'var(--color-text-primary)',
        cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {label}
    </button>
  )
}

const secondaryBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--color-text-muted)',
  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '6px 8px',
  fontFamily: "'DM Sans', sans-serif",
}

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--color-brand)', border: 'none', color: 'white',
  fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '6px 12px',
  borderRadius: 14, fontFamily: "'Syne', sans-serif",
}

export { formatScheduled }