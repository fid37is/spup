'use client'

import { forwardRef } from 'react'
import Link from 'next/link'

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
        <label htmlFor={inputId} className="spup-label">{label}</label>
        <input
          ref={ref}
          id={inputId}
          className={`spup-input${error ? ' error' : ''}`}
          {...props}
        />
        {error && <p style={{ fontSize: 12, color: 'var(--color-error)', marginTop: 6 }}>{error}</p>}
        {hint && !error && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>{hint}</p>}
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
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          fontSize: 'clamp(22px, 5vw, 28px)',
          color: 'var(--color-text-primary)',
          letterSpacing: '-0.02em',
          marginBottom: subtitle ? 8 : 0,
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 15, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{subtitle}</p>
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

export function Alert({ type, message }: AlertProps) {
  const isError = type === 'error'
  return (
    <div style={{
      background: isError ? 'var(--color-error-muted)' : 'var(--color-brand-muted)',
      border: `1px solid ${isError ? 'var(--color-error-border)' : 'var(--color-brand-border)'}`,
      borderRadius: 10,
      padding: '12px 16px',
      marginBottom: 20,
      fontSize: 14,
      color: isError ? 'var(--color-error)' : 'var(--color-brand)',
      lineHeight: 1.5,
    }}>
      {message}
    </div>
  )
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
      className="spup-btn-primary"
      style={{ marginTop: 8 }}
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      <span style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>{text}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
    </div>
  )
}