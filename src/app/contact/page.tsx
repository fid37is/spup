// src/app/contact/page.tsx
'use client'

import { useState, useTransition } from 'react'
import LegalLayout, { Section } from '@/components/landing/legal-layout'
import { CheckCircle } from 'lucide-react'

const G = 'var(--color-brand)'
const BORDER = 'var(--color-border)'
const MUTED = 'var(--color-text-muted)'

const TOPICS = [
  'General enquiry',
  'Press & media',
  'Creator support',
  'Report a bug',
  'Partnership',
  'Legal / Privacy',
  'Other',
]

// responsive handled via inline style
const CONTACTS = [
  { label: 'General', email: 'hello@spup.ng' },
  { label: 'Creator Support', email: 'creators@spup.ng' },
  { label: 'Press & Media', email: 'press@spup.ng' },
  { label: 'Legal & Privacy', email: 'legal@spup.ng' },
  { label: 'Trust & Safety', email: 'safety@spup.ng' },
]

export default function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [topic, setTopic] = useState(TOPICS[0])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Enter your name'); return }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address'); return }
    if (!message.trim() || message.trim().length < 10) { setError('Message must be at least 10 characters'); return }

    startTransition(async () => {
      // Simulate send — wire up to your email/form API
      await new Promise(r => setTimeout(r, 900))
      setSent(true)
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--color-input-bg)',
    border: '1px solid var(--color-input-border)',
    borderRadius: 10, padding: '11px 14px',
    fontSize: 14, color: 'var(--color-text-primary)',
    fontFamily: "'DM Sans', sans-serif",
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12, color: '#6A6A65',
    display: 'block', marginBottom: 6, fontWeight: 500,
  }

  return (
    <LegalLayout
      title="Contact Us"
      subtitle="Got a question, idea, or issue? We're a Nigerian team and we actually read our emails."
      lastUpdated="April 23, 2026"
    >
      <style>{`
        .spup-input::placeholder { color: #3A3A38; }
        .spup-input:focus { border-color: rgba(26,158,95,0.4) !important; }
        .spup-select option { background: #0A0A0E; color: #EDEDEA; }
      `}</style>

      {/* Direct contacts */}
      <Section title="Direct Contacts">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 8 }}>
          {CONTACTS.map(c => (
            <a key={c.email} href={`mailto:${c.email}`} style={{
              display: 'block',
              background: 'var(--color-surface)', border: `1px solid ${BORDER}`,
              borderRadius: 12, padding: '14px 16px',
              textDecoration: 'none', transition: 'border-color 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(26,158,95,0.3)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
            >
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 13, color: G, fontWeight: 600 }}>{c.email}</div>
            </a>
          ))}
        </div>
      </Section>

      {/* Contact form */}
      <Section title="Send a Message">
        {sent ? (
          <div style={{
            background: 'rgba(26,158,95,0.06)', border: '1px solid rgba(26,158,95,0.2)',
            borderRadius: 16, padding: '40px 32px', textAlign: 'center',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(26,158,95,0.1)', border: '1px solid rgba(26,158,95,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <CheckCircle size={24} color={G} />
            </div>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, color: 'var(--color-text-primary)', marginBottom: 8 }}>
              Message sent!
            </h3>
            <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.65 }}>
              We aim to reply within 2 business days. Check your spam folder if you don&apos;t hear back.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Full name</label>
                <input
                  className="spup-input"
                  style={inputStyle}
                  type="text"
                  placeholder="Chioma Obi"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div>
                <label style={labelStyle}>Email address</label>
                <input
                  className="spup-input"
                  style={inputStyle}
                  type="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Topic</label>
              <select
                className="spup-input spup-select"
                style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' }}
                value={topic}
                onChange={e => setTopic(e.target.value)}
              >
                {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Message</label>
              <textarea
                className="spup-input"
                style={{ ...inputStyle, minHeight: 140, resize: 'vertical', lineHeight: 1.6 }}
                placeholder="What's on your mind?"
                value={message}
                onChange={e => setMessage(e.target.value)}
              />
            </div>

            {error && (
              <div style={{
                fontSize: 13, color: 'var(--color-error)',
                background: 'var(--color-error-muted)',
                border: '1px solid var(--color-error-border)',
                borderRadius: 8, padding: '8px 14px',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              style={{
                background: isPending ? 'var(--color-brand-dim)' : G,
                border: 'none', borderRadius: 10, padding: '13px 28px',
                fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
                color: 'white', cursor: isPending ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s, transform 0.15s',
                alignSelf: 'flex-start',
              }}
              onMouseEnter={e => { if (!isPending) { e.currentTarget.style.background = 'var(--color-brand-hover)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
              onMouseLeave={e => { e.currentTarget.style.background = isPending ? 'var(--color-brand-dim)' : G; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              {isPending ? 'Sending…' : 'Send message'}
            </button>

            <p style={{ fontSize: 12, color: 'var(--color-text-faint)', lineHeight: 1.6 }}>
              We typically respond within 2 business days. For urgent issues, email safety@spup.ng directly.
            </p>
          </form>
        )}
      </Section>
    </LegalLayout>
  )
}