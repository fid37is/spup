import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100dvh',
      background: '#0A0A0A',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Top bar */}
      <div style={{
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #141414',
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: 22,
            color: '#22A861',
            letterSpacing: '-0.02em',
          }}>Spup</span>
        </Link>
      </div>

      {/* Main content */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {children}
        </div>
      </div>

      {/* Bottom note */}
      <div style={{ padding: '20px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: '#2A2A28', lineHeight: 1.6 }}>
          By continuing, you agree to Spup&apos;s{' '}
          <span style={{ color: '#3A3A35', textDecoration: 'underline', cursor: 'pointer' }}>Terms of Service</span>{' '}
          and{' '}
          <span style={{ color: '#3A3A35', textDecoration: 'underline', cursor: 'pointer' }}>Privacy Policy</span>.
        </p>
      </div>
    </div>
  )
}