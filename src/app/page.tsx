import { TrendingUp, Users, Zap, Shield, Globe, Mic } from 'lucide-react'
import LandingCTA from '@/components/landing/landing-cta'
import LandingFooter from '@/components/landing/landing-footer'
import LandingNav from '@/components/landing/landing-nav'
import LandingHeroCards from '@/components/landing/landing-hero-cards'
import { getWaitlistCountAction } from '@/lib/actions/waitlist'
import LandingMobileSection from '@/components/landing/landing-mobile-section'
import OrbitSection from '@/components/landing/orbit-section'
import { formatCreatorCount } from '@/lib/utils/format-creator-count'

/* ─── Data ─────────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: TrendingUp,
    title: 'Earn from every post',
    body: '70% of ad revenue goes directly to you, paid in Naira to your bank. No middlemen.',
    wide: true,
  },
  {
    icon: Users,
    title: 'Built for Naija',
    body: 'Nigerian phone login. Naira payouts. Local trending topics.',
    wide: false,
  },
  {
    icon: Zap,
    title: 'Tips & subscriptions',
    body: 'Let fans tip you or subscribe for exclusive content.',
    wide: false,
  },
  {
    icon: Shield,
    title: 'Transparent earnings',
    body: 'Real-time wallet, per-post breakdown. No black boxes.',
    wide: false,
  },
  {
    icon: Globe,
    title: 'Deep analytics',
    body: 'Audience by state, age, active hours. Know what performs.',
    wide: false,
  },
  {
    icon: Mic,
    title: 'Spaces & Live',
    body: 'Audio rooms in Pidgin, Yoruba, Igbo, Hausa. Tips in real-time.',
    wide: true,
  },
]

const TESTIMONIALS = [
  {
    name: 'Chioma Obi', handle: '@chioma_creates', location: 'Lagos', initials: 'CO',
    quote: "I made ₦45,000 in my first month just from ad revenue. My old platform paid in dollars I couldn't access.",
    earned: '₦45K / mo',
  },
  {
    name: 'Emeka Eze', handle: '@emekaeze', location: 'Abuja', initials: 'EE',
    quote: 'I know my audience is 22–28 yr olds in Lagos active at 7pm. My engagement doubled.',
    earned: '2× engagement',
  },
  {
    name: 'Fatima Bello', handle: '@fatimab', location: 'Kano', initials: 'FB',
    quote: 'First platform where I write in Hausa and actually trend. My community is here.',
    earned: '#1 in Hausa',
  },
]

/* ─── Page ─────────────────────────────────────────────────────────────── */

export default async function LandingPage() {
  const waitlistCount = await getWaitlistCountAction()

  return (
    <div style={{
      background: 'var(--color-bg)',
      minHeight: '100dvh',
      fontFamily: "'DM Sans', sans-serif",
      color: 'var(--color-text-primary)',
      overflowX: 'hidden',
    }}>
      <style>{`
        .hero-section {
          position: relative; z-index: 1;
          min-height: 100dvh; display: flex; align-items: center;
          max-width: 1200px; margin: 0 auto;
          padding: 100px 40px 80px; gap: 40px;
        }
        .hero-left  { flex: 0 0 44%; padding-right: 48px; }
        .hero-right { flex: 0 0 56%; position: relative; height: 580px; overflow: visible; }
        .stats-grid { max-width: 1000px; margin: 0 auto; display: grid; grid-template-columns: repeat(4,1fr); }
        .features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .paid-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; }
        .testimonials-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .section-pad   { position: relative; z-index: 1; padding: 100px 40px; }
        .section-pad-b { position: relative; z-index: 1; padding: 0 40px 100px; }
        .section-inner { max-width: 1100px; margin: 0 auto; }
        .cta-box {
          max-width: 860px; margin: 0 auto;
          padding: 80px 60px; text-align: center;
          position: relative; overflow: hidden; border-radius: 28px;
        }

        @media (max-width: 1023px) {
          .hero-right { flex: 0 0 52%; }
          .hero-left  { flex: 0 0 48%; padding-right: 32px; }
          .testimonials-grid { grid-template-columns: repeat(2,1fr); }
        }
        @media (max-width: 767px) {
          .hero-section {
            flex-direction: column; min-height: auto;
            padding: 90px 20px 60px; gap: 40px; align-items: flex-start;
          }
          .hero-left  { flex: none; width: 100%; padding-right: 0; }
          .hero-right { flex: none; width: 100%; height: 400px; }
          .stats-grid { grid-template-columns: repeat(2,1fr); }
          .features-grid { grid-template-columns: 1fr !important; }
          .features-grid > div {
            grid-column: span 1 !important;
            flex-direction: column !important;
            align-items: flex-start !important;
          }
          .paid-grid { grid-template-columns: repeat(2,1fr); gap: 12px; }
          .testimonials-grid { grid-template-columns: 1fr; }
          .section-pad   { padding: 60px 20px; }
          .section-pad-b { padding: 0 20px 60px; }
          .cta-box { padding: 48px 24px; border-radius: 20px; }
        }
        @media (max-width: 479px) {
          .paid-grid  { grid-template-columns: 1fr; }
          .hero-right { height: 340px; }
        }
      `}</style>

      {/* Static grid texture */}
      <svg
        aria-hidden
        width="100%" height="100%"
        style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}
      >
        <defs>
          <pattern id="g" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M60 0L0 0 0 60" fill="none" stroke="rgba(26,158,95,0.07)" strokeWidth="0.5" />
          </pattern>
          <radialGradient id="gf" cx="50%" cy="0%" r="60%">
            <stop offset="0%" stopColor="white" stopOpacity="0.9" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="gm"><rect width="100%" height="100%" fill="url(#gf)" /></mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)" mask="url(#gm)" />
      </svg>

      {/* Ambient glow */}
      <div aria-hidden style={{
        position: 'fixed', top: -200, left: '50%', transform: 'translateX(-50%)',
        width: 1000, height: 600, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse, rgba(26,158,95,0.1) 0%, transparent 60%)',
        borderRadius: '50%',
      }} />

      {/* ── NAV ── */}
      <LandingNav />

      {/* ── HERO ── */}
      <section className="hero-section">
        <div className="hero-left">

          {/* Beta pill */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'var(--color-brand-muted)',
            border: '1px solid var(--color-brand-border)',
            borderRadius: 100, padding: '5px 14px', marginBottom: 32,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--color-brand)', display: 'block',
              boxShadow: '0 0 8px var(--color-brand)',
            }} />
            <span style={{ fontSize: 12, color: 'var(--color-brand)', fontWeight: 600, letterSpacing: '0.07em' }}>
              NOW IN BETA — JOIN FREE
            </span>
          </div>

          <h1 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800,
            fontSize: 'clamp(56px, 6.5vw, 88px)',
            lineHeight: 0.94, letterSpacing: '-0.04em',
            marginBottom: 24, color: 'var(--color-text-primary)',
          }}>
            Speak up.<br />
            <span style={{ color: 'var(--color-brand)' }}>Get paid.</span>
          </h1>

          <p style={{
            fontSize: 'clamp(16px, 1.6vw, 19px)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.7, maxWidth: 440, marginBottom: 40,
          }}>
            Nigeria&apos;s social platform where your voice earns real money - 70% of ad revenue paid directly to your bank account in Naira.
          </p>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 48 }}>
            <LandingCTA label="Join the waitlist" variant="primary" opensModal={true} />
            <LandingCTA label="See how it works" variant="ghost" opensModal={false} href="#features" />
          </div>

          {/* Social proof */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex' }}>
              {['#1A9E5F', '#7A3A1A', '#9E1A5F', '#1A4A9E', '#6A1A9E'].map((bg, i) => (
                <div key={i} style={{
                  width: 32, height: 32, borderRadius: '50%', background: bg,
                  border: '2.5px solid var(--color-bg)',
                  marginLeft: i === 0 ? 0 : -10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 11, color: 'white',
                }}>
                  {['A', 'K', 'F', 'T', 'E'][i]}
                </div>
              ))}
            </div>
            {/* FIX: was waitlistCount.toLocaleString()+ which always shows + */}
            <div>
              <span style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 600 }}>
                {formatCreatorCount(waitlistCount)} creators
              </span>
              <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}> already on the waitlist</span>
            </div>
          </div>
        </div>

        {/* Right — floating post cards */}
        <LandingHeroCards />
      </section>

      {/* ── STATS BAR ── */}
      <div style={{
        position: 'relative', zIndex: 1,
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
      }}>
        <div className="stats-grid">
          {[
            { value: '123M', label: 'Nigerian internet users' },
            { value: '70%',  label: 'Ad revenue to creators' },
            { value: '₦1K',  label: 'Minimum payout' },
            { value: '500',  label: 'Characters per post' },
          ].map((s, i) => (
            <div key={i} style={{
              padding: '32px 20px', textAlign: 'center',
              borderRight: i < 3 ? '1px solid var(--color-border)' : 'none',
            }}>
              <div style={{
                fontFamily: "'Syne', sans-serif", fontWeight: 800,
                fontSize: 34, color: 'var(--color-brand)', letterSpacing: '-0.03em',
              }}>
                {s.value}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 5 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section id="features" className="section-pad">
        <div className="section-inner">
          <div style={{ marginBottom: 56 }}>
            <p style={{ fontSize: 12, color: 'var(--color-brand)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 10 }}>
              WHY SPUP
            </p>
            <h2 style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 800,
              fontSize: 'clamp(34px, 4.5vw, 54px)', letterSpacing: '-0.03em', lineHeight: 1.0,
              color: 'var(--color-text-primary)',
            }}>
              Finally built for us
            </h2>
          </div>
          <div className="features-grid">
            <FeatureCard f={FEATURES[0]} span={2} />
            <FeatureCard f={FEATURES[1]} span={1} />
            <FeatureCard f={FEATURES[2]} span={1} />
            <FeatureCard f={FEATURES[3]} span={1} />
            <FeatureCard f={FEATURES[4]} span={1} />
            <FeatureCard f={FEATURES[5]} span={3} />
          </div>
        </div>
      </section>

      {/* ── COMMUNITY ORBIT ── */}
      <OrbitSection count={waitlistCount} mode="waitlist" />

      {/* ── HOW YOU GET PAID ── */}
      <section className="section-pad-b">
        <div className="section-inner">
          <div style={{ marginBottom: 56 }}>
            <p style={{ fontSize: 12, color: 'var(--color-gold)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 10 }}>
              THE MONEY PART
            </p>
            <h2 style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 800,
              fontSize: 'clamp(34px, 4.5vw, 54px)', letterSpacing: '-0.03em', lineHeight: 1.0,
              color: 'var(--color-text-primary)',
            }}>
              How you get paid
            </h2>
          </div>
          <div className="paid-grid">
            {[
              { step: '01', title: 'Post content',      desc: 'Share your thoughts, videos, hot takes — anything you want. In Pidgin, Yoruba, Igbo, Hausa, or English.' },
              { step: '02', title: 'Build followers',   desc: "Reach 500 followers in 90 days to unlock earnings. We'll help you grow with smart analytics." },
              { step: '03', title: 'Ads run nearby',    desc: 'We sell ads to Nigerian brands. You keep 70% of what they pay — no hidden cuts, no surprises.' },
              { step: '04', title: 'Withdraw in Naira', desc: 'Hit ₦1,000 minimum? Transfer straight to your bank. Your money, your bank, no stress.' },
            ].map((s, i) => (
              <div key={i} style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 20, padding: '36px 32px',
              }}>
                <div style={{
                  fontFamily: "'Syne', sans-serif", fontWeight: 800,
                  fontSize: 72, color: 'var(--color-brand-muted)',
                  letterSpacing: '-0.05em', lineHeight: 1, marginBottom: 28,
                }}>
                  {s.step}
                </div>
                <div style={{
                  fontFamily: "'Syne', sans-serif", fontWeight: 700,
                  fontSize: 20, marginBottom: 14, color: 'var(--color-text-primary)',
                }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 15, color: 'var(--color-text-secondary)', lineHeight: 1.75 }}>
                  {s.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="section-pad-b">
        <div className="section-inner">
          <div style={{ marginBottom: 56 }}>
            <p style={{ fontSize: 12, color: 'var(--color-brand)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 10 }}>
              EARLY CREATORS
            </p>
            <h2 style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 800,
              fontSize: 'clamp(34px, 4.5vw, 54px)', letterSpacing: '-0.03em', lineHeight: 1.0,
              color: 'var(--color-text-primary)',
            }}>
              The people are talking
            </h2>
          </div>
          <div className="testimonials-grid">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 20, padding: 32,
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20,
                  background: 'var(--color-gold-muted)',
                  border: '1px solid var(--color-gold-border)',
                  borderRadius: 20, padding: '4px 12px', alignSelf: 'flex-start',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-gold)', display: 'block' }} />
                  <span style={{ fontSize: 12, color: 'var(--color-gold)', fontWeight: 600 }}>{t.earned}</span>
                </div>
                <p style={{
                  fontSize: 15, color: 'var(--color-text-secondary)',
                  lineHeight: 1.75, fontStyle: 'italic', flex: 1, marginBottom: 24,
                }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'var(--color-brand)', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13, color: 'white',
                  }}>
                    {t.initials}
                  </div>
                  <div>
                    <div style={{
                      fontSize: 14, fontWeight: 600,
                      fontFamily: "'Syne', sans-serif",
                      color: 'var(--color-text-primary)',
                    }}>
                      {t.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      {t.handle} · {t.location}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <LandingMobileSection />

      {/* ── FINAL CTA ── */}
      <section className="section-pad-b" style={{ paddingBottom: 120 }}>
        <div className="cta-box" style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-brand-border)',
        }}>
          <div aria-hidden style={{
            position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)',
            width: 600, height: 400, pointerEvents: 'none',
            background: 'radial-gradient(ellipse, rgba(26,158,95,0.1) 0%, transparent 65%)',
            borderRadius: '50%',
          }} />

          <p style={{
            fontSize: 12, color: 'var(--color-brand)', fontWeight: 600,
            letterSpacing: '0.1em', marginBottom: 16, position: 'relative',
          }}>
            GET EARLY ACCESS
          </p>
          <h2 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800,
            fontSize: 'clamp(36px, 5vw, 60px)',
            letterSpacing: '-0.04em', lineHeight: 0.95,
            marginBottom: 20, position: 'relative',
            color: 'var(--color-text-primary)',
          }}>
            Ready to<br />soro soke?
          </h2>

          {/* FIX: was <p> containing <p> — changed outer to <div> to fix hydration error */}
          <div style={{
            fontSize: 17, color: 'var(--color-text-secondary)',
            marginBottom: 40, lineHeight: 1.65, position: 'relative',
          }}>
            Join {formatCreatorCount(waitlistCount)} Nigerian creators already on the waitlist.<br />
            Free forever for regular users.
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', position: 'relative' }}>
            <LandingCTA label="Join the waitlist" variant="primary" opensModal={true} />
            <LandingCTA label="See how it works" variant="ghost" opensModal={false} href="#features" />
          </div>
          <p style={{
            fontSize: 12, color: 'var(--color-text-secondary)',
            marginTop: 20, position: 'relative',
          }}>
            No credit card required · Nigerian phone number only
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <LandingFooter />
    </div>
  )
}

/* ─── FeatureCard ───────────────────────────────────────────────────────── */

type FeatureCardProps = { f: typeof FEATURES[0]; span: 1 | 2 | 3 }

function FeatureCard({ f, span }: FeatureCardProps) {
  const isWide = span > 1
  return (
    <div style={{
      gridColumn: `span ${span}`,
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 20,
      padding: isWide ? '36px 40px' : '28px 28px',
      display: 'flex',
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'center' : 'flex-start',
      gap: isWide ? 32 : 0,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 13, flexShrink: 0,
        background: 'var(--color-brand-muted)',
        border: '1px solid var(--color-brand-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: isWide ? 0 : 20,
      }}>
        <f.icon size={22} color="var(--color-brand)" strokeWidth={1.8} />
      </div>
      <div>
        <h3 style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 700,
          fontSize: isWide ? 20 : 17, marginBottom: 10,
          color: 'var(--color-text-primary)',
        }}>
          {f.title}
        </h3>
        <p style={{
          fontSize: 15,
          color: 'var(--color-text-secondary)',
          lineHeight: 1.7,
          maxWidth: span === 3 ? 600 : 320,
        }}>
          {f.body}
        </p>
      </div>
    </div>
  )
}