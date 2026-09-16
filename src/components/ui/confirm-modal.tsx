'use client'

// ── ConfirmModal ──────────────────────────────────────────────────────────────
// Shared confirmation dialog: centered card + backdrop, used for anything that
// needs an "are you sure?" step (deleting a post, deleting a message, replacing
// a pinned post, etc). Owns the overlay, animation, and pending/disabled state
// so individual call sites don't have to re-implement it each time.
export default function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmingLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  /** Label shown on the confirm button while `pending` is true. Defaults to `${confirmLabel}…`. */
  confirmingLabel?: string
  cancelLabel?: string
  /** Renders the confirm button in the error color instead of the brand color. */
  destructive?: boolean
  /** Disables both buttons and swaps the confirm label - set while the action is in flight. */
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null

  return (
    <>
      <div
        onClick={e => { e.stopPropagation(); if (!pending) onCancel() }}
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--overlay-bg)' }}
      />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          zIndex: 201, width: 'min(360px, 92vw)',
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: 18, padding: 24,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          animation: 'confirmModalIn 0.15s ease-out',
        }}
      >
        <h3 style={{
          fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18,
          color: 'var(--color-text-primary)', marginBottom: 10,
        }}>
          {title}
        </h3>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
          {description}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            disabled={pending}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 20,
              border: '1px solid var(--color-border)', background: 'none',
              color: 'var(--color-text-secondary)', fontSize: 14,
              fontFamily: "'Syne',sans-serif", fontWeight: 600,
              cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1,
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 20,
              border: 'none', background: destructive ? 'var(--color-error)' : 'var(--color-brand)',
              color: 'white', fontSize: 14,
              fontFamily: "'Syne',sans-serif", fontWeight: 700,
              cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.7 : 1,
            }}
          >
            {pending ? (confirmingLabel ?? `${confirmLabel}…`) : confirmLabel}
          </button>
        </div>
      </div>
      <style>{`@keyframes confirmModalIn {
        from { opacity: 0; transform: translate(-50%,-50%) translateY(-10px) scale(0.98); }
        to   { opacity: 1; transform: translate(-50%,-50%); }
      }`}</style>
    </>
  )
}