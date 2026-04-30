'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
  warning: (message: string, duration?: number) => void
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

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const duration = toast.duration ?? 3000
  const cfg = STYLES[toast.type]
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
      borderRadius: 100,
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      boxShadow: cfg.shadow,
      opacity: visible && !leaving ? 1 : 0,
      transform: visible && !leaving ? 'translateY(0) scale(1)' : 'translateY(-12px) scale(0.95)',
      transition: 'opacity 0.22s ease, transform 0.22s cubic-bezier(0.34,1.2,0.64,1)',
      pointerEvents: 'none',
      userSelect: 'none',
      whiteSpace: 'nowrap',
    }}>
      <Icon size={15} color={cfg.iconColor} style={{ flexShrink: 0 }} />
      <span style={{
        fontSize: 13,
        fontWeight: 600,
        color: cfg.textColor,
        fontFamily: "'DM Sans', sans-serif",
        letterSpacing: '0.01em',
      }}>
        {toast.message}
      </span>
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

  const toast = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
    const id = `toast_${Date.now()}_${Math.random()}`
    setToasts(prev => [...prev.slice(-4), { id, type, message, duration }])
  }, [])

  const success = useCallback((msg: string, dur?: number) => toast(msg, 'success', dur), [toast])
  const error   = useCallback((msg: string, dur?: number) => toast(msg, 'error', dur), [toast])
  const info    = useCallback((msg: string, dur?: number) => toast(msg, 'info', dur), [toast])
  const warning = useCallback((msg: string, dur?: number) => toast(msg, 'warning', dur), [toast])

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