// src/components/layout/support-resources-host.tsx
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Phone, X } from 'lucide-react'
import { SUPPORT_EVENT, SUPPORT_RESOURCES } from '@/lib/support-resources'

// Mounted once in the main layout. Composers (which unmount as soon as a post
// is sent) just fire an event; this stays alive to show the screen.
export default function SupportResourcesHost() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const show = () => setOpen(true)
    window.addEventListener(SUPPORT_EVENT, show)
    return () => window.removeEventListener(SUPPORT_EVENT, show)
  }, [])

  if (!mounted || !open) return null

  return createPortal(
    <div
      onClick={() => setOpen(false)}
      className="support-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'center' }}
    >
      <div
        role="dialog"
        aria-label="Support resources"
        onClick={e => e.stopPropagation()}
        className="support-panel"
        style={{
          background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
          width: '100%', maxWidth: 440, maxHeight: '88vh', overflowY: 'auto',
          padding: '18px 18px calc(18px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)' }}>
            You&apos;re not alone
          </h2>
          <button
            type="button" onClick={() => setOpen(false)} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
          It sounds like things might be really hard right now. Talking to someone can help,
          and these lines are free. Reaching out to a friend or family member you trust counts too.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {SUPPORT_RESOURCES.map(r => (
            <a
              key={r.name}
              href={`tel:${r.tel}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none',
                padding: '11px 13px', borderRadius: 12, border: '1px solid var(--color-border)',
                background: 'var(--color-surface-2)',
              }}
            >
              <span style={{
                width: 34, height: 34, borderRadius: 17, flexShrink: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center', background: 'var(--color-brand)', color: 'white',
              }}>
                <Phone size={16} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {r.name} · {r.display}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginTop: 1 }}>
                  {r.description}
                </span>
              </span>
            </a>
          ))}
        </div>

        <button
          type="button" onClick={() => setOpen(false)}
          style={{
            width: '100%', minHeight: 44, borderRadius: 22, border: '1px solid var(--color-border)',
            background: 'transparent', color: 'var(--color-text-primary)', cursor: 'pointer',
            fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
          }}
        >
          Close
        </button>
      </div>

      <style>{`
        .support-overlay { align-items: center; }
        .support-panel { border-radius: 18px; }
        @media (max-width: 640px) {
          .support-overlay { align-items: flex-end; }
          .support-panel { border-radius: 18px 18px 0 0; max-width: none !important; }
        }
      `}</style>
    </div>,
    document.body,
  )
}
