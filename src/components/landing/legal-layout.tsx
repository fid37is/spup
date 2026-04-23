// src/components/landing/legal-layout.tsx
import Link from 'next/link'
import LandingFooter from './landing-footer'

interface LegalLayoutProps {
  title: string
  subtitle: string
  lastUpdated: string
  children: React.ReactNode
}

export default function LegalLayout({ title, subtitle, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100dvh', fontFamily: "'DM Sans', sans-serif", color: 'var(--color-text-primary)' }}>
      <style>{`
        .legal-nav   { padding: 0 40px; }
        .legal-hero  { padding: 100px 40px 56px; }
        .legal-main  { padding: 64px 40px 100px; }
        .legal-inner { max-width: 760px; margin: 0 auto; }
        @media (max-width: 767px) {
          .legal-nav  { padding: 0 20px; }
          .legal-hero { padding: 84px 20px 40px; }
          .legal-main { padding: 40px 20px 80px; }
        }
      `}</style>

      {/* Grid texture */}
      <svg aria-hidden width="100%" height="100%" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <defs>
          <pattern id="g" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M60 0L0 0 0 60" fill="none" stroke="rgba(26,158,95,0.04)" strokeWidth="0.5" />
          </pattern>
          <radialGradient id="gf" cx="50%" cy="0%" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="0.6" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="gm"><rect width="100%" height="100%" fill="url(#gf)" /></mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)" mask="url(#gm)" />
      </svg>

      {/* Nav */}
      <nav className="legal-nav" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(5,5,8,0.88)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <img src="/logo.png" alt="Spup" style={{ width: 30, height: 30, borderRadius: 7 }} />
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--color-brand)', letterSpacing: '-0.02em' }}>Spup</span>
        </Link>
        <Link href="/" style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          ← Back
        </Link>
      </nav>

      {/* Hero header */}
      <div className="legal-hero" style={{
        position: 'relative', zIndex: 1,
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
      }}>
        <div aria-hidden style={{
          position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)',
          width: 600, height: 360,
          background: 'radial-gradient(ellipse, rgba(26,158,95,0.06) 0%, transparent 65%)',
          borderRadius: '50%', pointerEvents: 'none',
        }} />
        <div className="legal-inner" style={{ position: 'relative' }}>
          <p style={{ fontSize: 11, color: 'var(--color-brand)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 12 }}>SPUP LEGAL</p>
          <h1 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800,
            fontSize: 'clamp(30px, 5vw, 52px)',
            letterSpacing: '-0.04em', lineHeight: 0.96,
            marginBottom: 14, color: 'var(--color-text-primary)',
          }}>{title}</h1>
          <p style={{ fontSize: 15, color: 'var(--color-text-muted)', lineHeight: 1.65 }}>{subtitle}</p>
          <p style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 14 }}>Last updated: {lastUpdated}</p>
        </div>
      </div>

      {/* Content */}
      <main className="legal-main" style={{ position: 'relative', zIndex: 1 }}>
        <div className="legal-inner">{children}</div>
      </main>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <LandingFooter />
      </div>
    </div>
  )
}

/* ── Shared prose helpers ── */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 52 }}>
      <h2 style={{
        fontFamily: "'Syne', sans-serif", fontWeight: 700,
        fontSize: 'clamp(17px, 3vw, 21px)', color: 'var(--color-text-primary)',
        letterSpacing: '-0.02em', marginBottom: 16,
        paddingBottom: 12, borderBottom: '1px solid var(--color-border)',
      }}>{title}</h2>
      <div style={{ fontSize: 15, color: 'var(--color-text-muted)', lineHeight: 1.85 }}>
        {children}
      </div>
    </section>
  )
}

export function P({ children }: { children: React.ReactNode }) {
  return <p style={{ marginBottom: 14 }}>{children}</p>
}

export function UL({ items }: { items: string[] }) {
  return (
    <ul style={{ paddingLeft: 20, marginBottom: 14 }}>
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: 8, paddingLeft: 4 }}>{item}</li>
      ))}
    </ul>
  )
}

export function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--color-brand-muted)',
      border: '1px solid var(--color-brand-border)',
      borderRadius: 12, padding: '16px 20px',
      marginBottom: 20, fontSize: 14,
      color: 'var(--color-text-secondary)', lineHeight: 1.7,
    }}>
      {children}
    </div>
  )
}