'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

/** An optional button on the toast (e.g. "View", "Retry"). Tapping it also dismisses the toast. */
export interface ToastAction {
  label: string
  onClick: () => void
}

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
  action?: ToastAction
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number, action?: ToastAction) => void
  success: (message: string, duration?: number, action?: ToastAction) => void
  error: (message: string, duration?: number, action?: ToastAction) => void
  info: (message: string, duration?: number, action?: ToastAction) => void
  warning: (message: string, duration?: number, action?: ToastAction) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const STYLES: Record<ToastType, {
  icon: React.ElementType
  background: string
  border: string
  iconColor: string
  textColor: string
  shadow: string
}> = {
  success: {
    icon: CheckCircle,
    background: 'rgba(22, 163, 74, 0.18)',
    border: 'rgba(74, 222, 128, 0.3)',
    iconColor: '#4ade80',
    textColor: '#dcfce7',
    shadow: '0 8px 32px rgba(22,163,74,0.3), 0 1px 0 rgba(255,255,255,0.06) inset',
  },
  error: {
    icon: AlertCircle,
    background: 'rgba(30, 30, 30, 0.75)',
    border: 'rgba(255,255,255,0.12)',
    iconColor: '#f87171',
    textColor: '#f1f5f9',
    shadow: '0 8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset',
  },
  warning: {
    icon: AlertTriangle,
    background: 'rgba(30, 30, 30, 0.75)',
    border: 'rgba(255,255,255,0.12)',
    iconColor: '#fbbf24',
    textColor: '#f1f5f9',
    shadow: '0 8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset',
  },
  info: {
    icon: Info,
    background: 'rgba(30, 30, 30, 0.75)',
    border: 'rgba(255,255,255,0.12)',
    iconColor: '#93c5fd',
    textColor: '#f1f5f9',
    shadow: '0 8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset',
  },
}

// The colours above are tuned for the dark theme (pale text on a dark/tinted
// glass pill) and are close to invisible on a light page. Light theme gets its
// own set: a near-white pill with dark text and a darker accent icon.
const LIGHT_STYLES: typeof STYLES = {
  success: {
    icon: CheckCircle,
    background: 'rgba(240, 253, 244, 0.97)',
    border: 'rgba(22, 163, 74, 0.35)',
    iconColor: '#16a34a',
    textColor: '#14532d',
    shadow: '0 8px 24px rgba(22,163,74,0.18), 0 1px 3px rgba(0,0,0,0.08)',
  },
  error: {
    icon: AlertCircle,
    background: 'rgba(255, 255, 255, 0.97)',
    border: 'rgba(0,0,0,0.12)',
    iconColor: '#dc2626',
    textColor: '#0e0e10',
    shadow: '0 8px 24px rgba(0,0,0,0.14), 0 1px 3px rgba(0,0,0,0.08)',
  },
  warning: {
    icon: AlertTriangle,
    background: 'rgba(255, 255, 255, 0.97)',
    border: 'rgba(0,0,0,0.12)',
    iconColor: '#d97706',
    textColor: '#0e0e10',
    shadow: '0 8px 24px rgba(0,0,0,0.14), 0 1px 3px rgba(0,0,0,0.08)',
  },
  info: {
    icon: Info,
    background: 'rgba(255, 255, 255, 0.97)',
    border: 'rgba(0,0,0,0.12)',
    iconColor: '#2563eb',
    textColor: '#0e0e10',
    shadow: '0 8px 24px rgba(0,0,0,0.14), 0 1px 3px rgba(0,0,0,0.08)',
  },
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // A toast with a button needs time to be read and tapped.
  const duration = toast.duration ?? (toast.action ? 6000 : 3000)
  // Toasts only ever render on the client and live a few seconds, so reading
  // the resolved theme (always 'light' or 'dark') once when it appears is enough.
  const [light] = useState(() => document.documentElement.getAttribute('data-theme') === 'light')
  const cfg = (light ? LIGHT_STYLES : STYLES)[toast.type]
  const Icon = cfg.icon

  useEffect(() => {
    const enterTimeout = setTimeout(() => setVisible(true), 10)
    timerRef.current = setTimeout(dismiss, duration)
    return () => { clearTimeout(enterTimeout); clearTimeout(timerRef.current) }
  }, []) // eslint-disable-line

  function dismiss() {
    setLeaving(true)
    setTimeout(() => onDismiss(toast.id), 260)
  }

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: '10px 18px',
      background: cfg.background,
      border: `1px solid ${cfg.border}`,
      // Long messages (e.g. an upload error) wrap instead of running off a
      // narrow phone screen; short ones stay a single-line pill.
      borderRadius: toast.action || toast.message.length > 40 ? 20 : 100,
      maxWidth: 'calc(100vw - 32px)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      boxShadow: cfg.shadow,
      opacity: visible && !leaving ? 1 : 0,
      transform: visible && !leaving ? 'translateY(0) scale(1)' : 'translateY(-12px) scale(0.95)',
      transition: 'opacity 0.22s ease, transform 0.22s cubic-bezier(0.34,1.2,0.64,1)',
      // Plain toasts never intercept taps; one with a button has to receive them.
      pointerEvents: toast.action ? 'auto' : 'none',
      userSelect: 'none',
    }}>
      <Icon size={15} color={cfg.iconColor} style={{ flexShrink: 0 }} />
      <span style={{
        fontSize: 13,
        fontWeight: 600,
        color: cfg.textColor,
        fontFamily: "'DM Sans', sans-serif",
        letterSpacing: '0.01em',
        textAlign: 'center',
      }}>
        {toast.message}
      </span>
      {toast.action && (
        <button
          type="button"
          onClick={() => { toast.action?.onClick(); clearTimeout(timerRef.current); dismiss() }}
          style={{
            flexShrink: 0,
            marginLeft: 4,
            padding: '4px 12px',
            borderRadius: 100,
            border: 'none',
            background: light ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.14)',
            color: cfg.textColor,
            fontSize: 12.5,
            fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  )
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return createPortal(
    <div style={{
      position: 'fixed',
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      alignItems: 'center',
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info', duration?: number, action?: ToastAction) => {
    const id = `toast_${Date.now()}_${Math.random()}`
    setToasts(prev => [...prev.slice(-4), { id, type, message, duration, action }])
  }, [])

  const success = useCallback((msg: string, dur?: number, action?: ToastAction) => toast(msg, 'success', dur, action), [toast])
  const error   = useCallback((msg: string, dur?: number, action?: ToastAction) => toast(msg, 'error', dur, action), [toast])
  const info    = useCallback((msg: string, dur?: number, action?: ToastAction) => toast(msg, 'info', dur, action), [toast])
  const warning = useCallback((msg: string, dur?: number, action?: ToastAction) => toast(msg, 'warning', dur, action), [toast])

  return (
    <ToastContext.Provider value={{ toast, success, error, info, warning }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}