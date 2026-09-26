// src/app/reviews/page.tsx
'use client'

import { useState, useTransition } from 'react'
import LandingNav from '@/components/landing/landing-nav'
import LandingFooter from '@/components/landing/landing-footer'
import { submitTestimonialAction } from '@/lib/actions/testimonials'
import { CheckCircle2 } from 'lucide-react'

export default function ReviewsPage() {
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [location, setLocation] = useState('')
  const [quote, setQuote] = useState('')
  const [earnedLabel, setEarnedLabel] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const r = await submitTestimonialAction({ name, handle, location, quote, earned_label: earnedLabel })
      if ('error' in r && r.error) { setError(r.error); return }
      setSubmitted(true)
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--color-input-bg)',
    border: '1px solid var(--color-input-border)',
    borderRadius: 10, padding: '12px 14px',
    fontSize: 15, color: 'var(--color-text-primary)',
    fontFamily: "'DM Sans', sans-serif",
    outline: 'none', boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600,
    color: 'var(--color-text-secondary)', marginBottom: 6,
  }

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100dvh', fontFamily: "'DM Sans', sans-serif", color: 'var(--color-text-primary)' }}>
      <LandingNav />

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '100px 20px 100px' }}>
        {submitted ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'var(--color-brand-muted)', border: '1px solid var(--color-brand-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px',
            }}>
              <CheckCircle2 size={30} color="var(--color-brand)" />
            </div>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 28, marginBottom: 12 }}>
              Thanks for sharing!
            </h1>
            <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
              We read every review — yours will show up on the homepage once it&rsquo;s been checked out.
            </p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 12, color: 'var(--color-brand)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 10 }}>
              SHARE YOUR STORY
            </p>
            <h1 style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 800,
              fontSize: 'clamp(30px, 4vw, 42px)', letterSpacing: '-0.02em', lineHeight: 1.05,
              marginBottom: 16,
            }}>
              Tell other creators what Spup has done for you
            </h1>
            <p style={{ fontSize: 16, color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 40 }}>
              Real stories from real creators help other Nigerians decide to join. Takes two minutes.
            </p>

            {error && (
              <div style={{ background: 'var(--color-error-muted)', border: '1px solid var(--color-error-border)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: 'var(--color-error)' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Your name</label>
                <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Chioma Obi" maxLength={80} required />
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Spup handle <span style={{ color: 'var(--color-text-faint)', fontWeight: 400 }}>(optional)</span></label>
                  <input style={inputStyle} value={handle} onChange={e => setHandle(e.target.value)} placeholder="@chioma_creates" maxLength={40} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Location <span style={{ color: 'var(--color-text-faint)', fontWeight: 400 }}>(optional)</span></label>
                  <input style={inputStyle} value={location} onChange={e => setLocation(e.target.value)} placeholder="Lagos" maxLength={60} />
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Your review</label>
                <textarea
                  style={{ ...inputStyle, minHeight: 120, resize: 'vertical', fontFamily: "'DM Sans', sans-serif" }}
                  value={quote}
                  onChange={e => setQuote(e.target.value)}
                  placeholder="What's your experience been like on Spup?"
                  maxLength={500}
                  required
                />
                <p style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 6 }}>{quote.length}/500</p>
              </div>

              <div style={{ marginBottom: 32 }}>
                <label style={labelStyle}>Something you&rsquo;d like to highlight <span style={{ color: 'var(--color-text-faint)', fontWeight: 400 }}>(optional)</span></label>
                <input style={inputStyle} value={earnedLabel} onChange={e => setEarnedLabel(e.target.value)} placeholder="e.g. ₦45K / mo, or 2× engagement" maxLength={30} />
              </div>

              <button
                type="submit"
                disabled={isPending}
                style={{
                  width: '100%', background: 'var(--color-brand)', color: 'white', border: 'none',
                  borderRadius: 10, padding: '14px', fontFamily: "'Syne', sans-serif",
                  fontWeight: 700, fontSize: 16, cursor: isPending ? 'not-allowed' : 'pointer',
                  opacity: isPending ? 0.6 : 1,
                }}
              >
                {isPending ? 'Submitting…' : 'Submit review'}
              </button>
            </form>
          </>
        )}
      </div>

      <LandingFooter />
    </div>
  )
}