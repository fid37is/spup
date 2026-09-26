// src/components/landing/waitlist-modal.tsx
'use client'

import React, { useState, useTransition } from 'react'
import { X, CheckCircle, Mail } from 'lucide-react'
import { joinWaitlistAction } from '@/lib/actions/waitlist'

interface WaitlistModalProps {
  onClose: () => void
  waitlistOpen: boolean
}

export default function WaitlistModal({ onClose, waitlistOpen }: WaitlistModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ position: number; alreadyRegistered: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Enter your name')
      return
    }
    if (!email.trim()) {
      setError('Enter your email address')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address')
      return
    }

    startTransition(async () => {
      const res = await joinWaitlistAction({
        full_name: name,
        phone: '',
        email,
        referrer: document.referrer,
      })

      if (res.error) {
        setError(res.error)
        return
      }

      if (res.success) {
        setResult({
          position: res.position!,
          alreadyRegistered: res.alreadyRegistered!,
        })
      }
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />

      {/* Modal — truly centered via fixed + transform */}
      <div
        style={{
          position: 'fixed',
          zIndex: 1001,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'calc(100% - 32px)',
          maxWidth: 400,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 20,
          boxShadow: '0 32px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(26,158,95,0.08)',
          overflow: 'hidden',
          animation: 'modalIn 0.18s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <style>{`
          @keyframes modalIn {
            from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }
            to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          }
          .wl-input {
            width: 100%;
            background: var(--input-bg);
            border: 1px solid var(--color-border);
            border-radius: 10px;
            padding: 11px 14px;
            font-size: 14px;
            color: var(--color-text-primary);
            font-family: 'DM Sans', sans-serif;
            outline: none;
            box-sizing: border-box;
            transition: border-color 0.15s;
          }
          .wl-input::placeholder { color: var(--color-text-faint); }
          .wl-input:focus { border-color: rgba(26,158,95,0.4); }
          .wl-input-icon {
            width: 100%;
            background: var(--input-bg);
            border: 1px solid var(--color-border);
            border-radius: 10px;
            padding: 11px 14px 11px 38px;
            font-size: 14px;
            color: var(--color-text-primary);
            font-family: 'DM Sans', sans-serif;
            outline: none;
            box-sizing: border-box;
            transition: border-color 0.15s;
          }
          .wl-input-icon::placeholder { color: var(--color-text-faint); }
          .wl-input-icon:focus { border-color: rgba(26,158,95,0.4); }
        `}</style>

        {/* Green top stripe */}
        <div style={{ height: 3, background: 'var(--color-brand)' }} />

        <div style={{ padding: '24px 24px 28px', position: 'relative' }}>
          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: '50%',
              width: 30,
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
            }}
          >
            <X size={14} />
          </button>

          {!waitlistOpen ? (
            // ── Waitlist closed — we've already invited everyone in and
            // moved past the pre-launch phase ──
            <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
              <div
                style={{
                  width: 60, height: 60, borderRadius: '50%',
                  background: 'var(--color-brand-muted)',
                  border: '1px solid var(--color-brand-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 18px',
                }}
              >
                <CheckCircle size={26} color="var(--color-brand)" />
              </div>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', marginBottom: 8 }}>
                We&apos;re live
              </h2>
              <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.65, marginBottom: 20 }}>
                Spup is open now — no more waiting. Create your account and jump in.
              </p>
              <a
                href="/signup"
                style={{
                  display: 'block', width: '100%', boxSizing: 'border-box',
                  background: 'var(--color-brand)', border: 'none', borderRadius: 10, padding: '12px',
                  fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'white',
                  textAlign: 'center', textDecoration: 'none',
                }}
              >
                Create your account
              </a>
            </div>
          ) : result ? (
            // ── Success state ──
            <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  background: 'var(--color-brand-muted)',
                  border: '1px solid var(--color-brand-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 18px',
                }}
              >
                <CheckCircle size={26} color="var(--color-brand)" />
              </div>

              <h2
                style={{
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  fontSize: 22,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.02em',
                  marginBottom: 8,
                }}
              >
                {result.alreadyRegistered ? 'Already on the list!' : "You're in as a Pioneer"}
              </h2>

              <p
                style={{
                  fontSize: 14,
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.65,
                  marginBottom: 20,
                }}
              >
                {result.alreadyRegistered
                  ? "You already signed up. We'll reach out when it's time."
                  : "You’ll get into Spup before the public launch and unlock easier monetization thresholds as a Pioneer creator."}
              </p>

              <div
                style={{
                  background: 'var(--color-brand-muted)',
                  border: '1px solid var(--color-brand-border)',
                  borderRadius: 14,
                  padding: '16px 20px',
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--color-brand)',
                    fontWeight: 600,
                    letterSpacing: '0.07em',
                    marginBottom: 4,
                  }}
                >
                  YOUR POSITION
                </div>
                <div
                  style={{
                    fontFamily: "'Syne', sans-serif",
                    fontWeight: 800,
                    fontSize: 38,
                    color: 'var(--color-text-primary)',
                    letterSpacing: '-0.03em',
                  }}
                >
                  #{result.position.toLocaleString()}
                </div>
              </div>

              <button
                onClick={onClose}
                style={{
                  width: '100%',
                  background: 'var(--color-brand)',
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px',
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 700,
                  fontSize: 15,
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          ) : (
            // ── Form ──
            <>
              <h2
                style={{
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  fontSize: 22,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.02em',
                  marginBottom: 6,
                }}
              >
                Join the waitlist
              </h2>
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.55,
                  marginBottom: 22,
                }}
              >
                Get into Spup at least a week before public launch and unlock easier
                monetization thresholds as a Pioneer creator.
              </p>

              <form onSubmit={handleSubmit} noValidate>
                {/* Name */}
                <div style={{ marginBottom: 12 }}>
                  <label
                    style={{
                      fontSize: 12,
                      color: 'var(--color-text-muted)',
                      display: 'block',
                      marginBottom: 6,
                      fontWeight: 500,
                    }}
                  >
                    Full name
                  </label>
                  <input
                    className="wl-input"
                    type="text"
                    placeholder="Chioma Obi"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                    autoComplete="name"
                  />
                </div>

                {/* Email */}
                <div style={{ marginBottom: 20 }}>
                  <label
                    style={{
                      fontSize: 12,
                      color: 'var(--color-text-muted)',
                      display: 'block',
                      marginBottom: 6,
                      fontWeight: 500,
                    }}
                  >
                    Email address
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail
                      size={14}
                      style={{
                        position: 'absolute',
                        left: 13,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--color-text-faint)',
                        pointerEvents: 'none',
                      }}
                    />
                    <input
                      className="wl-input-icon"
                      type="email"
                      placeholder="you@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 13,
                      color: 'var(--color-error)',
                      background: 'var(--color-error-muted)',
                      border: '1px solid var(--color-error-border)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      marginBottom: 14,
                    }}
                  >
                    <X size={13} /> {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    width: '100%',
                    background: isPending ? 'var(--color-brand-dim)' : 'var(--color-brand)',
                    border: 'none',
                    borderRadius: 10,
                    padding: '13px',
                    fontFamily: "'Syne', sans-serif",
                    fontWeight: 700,
                    fontSize: 15,
                    color: 'white',
                    cursor: isPending ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {isPending ? 'Joining…' : 'Reserve my Pioneer spot'}
                </button>

                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--color-text-faint)',
                    marginTop: 12,
                    textAlign: 'center',
                    lineHeight: 1.6,
                  }}
                >
                  No spam. We&apos;ll only message you about early access and launch.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  )
}