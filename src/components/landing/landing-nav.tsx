'use client'

import LandingCTA from '@/components/landing/landing-cta'

const G      = 'var(--color-brand)'
const BORDER = 'var(--color-border)'

export default function LandingNav() {
  return (
    <>
      <style>{`
        .landing-nav-wrap {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 200;
          background: rgba(5,5,8,0.88);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid ${BORDER};
        }
        .landing-nav-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 58px;
          padding: 0 40px;
        }
        .landing-nav-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
          text-decoration: none;
        }
        .landing-nav-logo-text {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 22px;
          color: ${G};
          letter-spacing: -0.02em;
        }
        .landing-nav-actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-shrink: 0;
        }

        /* Compact wrapper overrides LandingCTA sizing */
        .nav-cta-wrap button,
        .nav-cta-wrap a {
          padding: 8px 18px !important;
          font-size: 14px !important;
          width: auto !important;
          white-space: nowrap;
        }

        /* Show/hide full vs short labels */
        .nav-join-full  { display: inline; }
        .nav-join-short { display: none;   }

        @media (max-width: 767px) {
          .landing-nav-inner { padding: 0 16px; }
        }

        /* Tighten buttons below 480px */
        @media (max-width: 480px) {
          .nav-cta-wrap button,
          .nav-cta-wrap a {
            padding: 8px 14px !important;
            font-size: 13px !important;
          }
          .nav-join-full  { display: none;   }
          .nav-join-short { display: inline; }
        }

        /* Hide login button on very small screens */
        @media (max-width: 340px) {
          .nav-login-wrap { display: none; }
        }
      `}</style>

      <nav className="landing-nav-wrap">
        <div className="landing-nav-inner">

          {/* Logo */}
          <a href="/" className="landing-nav-logo">
            <img
              src="/logo.png"
              alt="Spup"
              style={{ width: 54, height: 54, borderRadius: 8, display: 'block' }}
            />
            <span className="landing-nav-logo-text">Spup</span>
          </a>

          {/* Actions */}
          <div className="landing-nav-actions">
            {/* Login */}
            <div className="nav-cta-wrap nav-login-wrap">
              <LandingCTA label="Log in" variant="ghost" opensModal={false} href="/login" />
            </div>

            {/* Join — two versions, CSS shows/hides */}
            <div className="nav-cta-wrap">
              <span className="nav-join-full">
                <LandingCTA label="Join the waitlist" variant="primary" opensModal={true} />
              </span>
              <span className="nav-join-short">
                <LandingCTA label="Join" variant="primary" opensModal={true} />
              </span>
            </div>
          </div>

        </div>
      </nav>
    </>
  )
}