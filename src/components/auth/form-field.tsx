'use client'

import { forwardRef, useEffect, useRef } from 'react'
import { useToast } from '@/components/layout/toast'

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, hint, id, ...props }, ref) => {
    const inputId = id || label.toLowerCase().replace(/\s+/g, '-')
    return (
      <div style={{ marginBottom: 16 }}>
        <label htmlFor={inputId} style={{
          display: 'block', fontSize: 13, fontWeight: 500,
          color: 'var(--color-text-secondary)', marginBottom: 6, letterSpacing: '0.01em',
        }}>
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={`para-input${error ? ' error' : ''}`}
          {...props}
        />
        {error && (
          <p style={{ fontSize: 12, color: 'var(--color-error)', marginTop: 6 }}>{error}</p>
        )}
        {hint && !error && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>{hint}</p>
        )}
      </div>
    )
  }
)
FormField.displayName = 'FormField'

interface AuthCardProps {
  title: string
  subtitle?: string
  children: React.ReactNode
}

export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <div>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          fontSize: 28,
          color: 'var(--color-text-primary)',
          letterSpacing: '-0.02em',
          marginBottom: subtitle ? 8 : 0,
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  )
}

interface AlertProps {
  type: 'error' | 'success'
  message: string
}

// Auth-page notices are shown as toasts. The old inline box pushed the form
// down whenever it appeared, which made the page jump. Kept under the name
// <Alert> so every auth page keeps working unchanged; it renders nothing in
// the layout. Pages clear their message when the person submits again, which
// unmounts and remounts this, so the same error shows again on a retry.
export function Alert({ type, message }: AlertProps) {
  const toast = useToast()
  const lastShown = useRef<string | null>(null)

  useEffect(() => {
    if (!message || lastShown.current === message) return
    lastShown.current = message
    if (type === 'error') toast.error(message, 6000)
    else toast.success(message)
  }, [type, message, toast])

  return null
}

interface SubmitButtonProps {
  loading?: boolean
  children: React.ReactNode
  onClick?: () => void
  type?: 'submit' | 'button'
}

export function SubmitButton({ loading, children, onClick, type = 'submit' }: SubmitButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading}
      className="para-btn-primary"
      style={{ marginTop: 8, position: 'relative' }}
    >
      {loading ? (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{
            width: 16, height: 16, borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: 'white',
            display: 'inline-block',
            animation: 'spin 0.7s linear infinite',
          }} />
          Processing...
        </span>
      ) : children}
    </button>
  )
}

export function Divider({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{text}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
    </div>
  )
}