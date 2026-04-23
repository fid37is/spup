// src/components/landing/landing-footer.tsx
import Link from 'next/link'

const LINKS = [
  { label: 'Privacy',        href: '/privacy' },
  { label: 'Terms',          href: '/terms' },
  { label: 'Content Policy', href: '/content-policy' },
  { label: 'Contact',        href: '/contact' },
]

export default function LandingFooter() {
  return (
    <footer style={{
      borderTop: '1px solid var(--color-border)',
      padding: '28px 40px',
      position: 'relative', zIndex: 1,
    }}>
      <style>{`
        .footer-inner {
          max-width: 1100px;
          margin: 0 auto;
          display: flex;
          flex-direction: row;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          gap: 32px;
        }
        .footer-nav { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; }
        .footer-nav a { color: var(--color-text-secondary); text-decoration: none; font-size: 13px; transition: color 0.15s; }
        .footer-nav a:hover { color: var(--color-text-primary); }

        @media (max-width: 767px) {
          footer { padding: 24px 20px !important; }
          .footer-inner { flex-direction: column; gap: 20px; }
          .footer-nav { gap: 16px; }
        }
      `}</style>

      <div className="footer-inner">

        {/* Logo + wordmark */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/logo.png" alt="Spup" style={{ width: 54, height: 54, borderRadius: 8, display: 'block' }} />
          <span style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800,
            fontSize: 20, color: 'var(--color-brand)',
          }}>
            Spup
          </span>
        </Link>

        {/* Nav links */}
        <nav className="footer-nav">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}>{l.label}</Link>
          ))}
        </nav>

        {/* Copyright */}
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
          © 2026 Spup Technologies Limited
        </span>

      </div>
    </footer>
  )
}