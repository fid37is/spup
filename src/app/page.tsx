import { TrendingUp, Users, Zap, Shield, Globe, Mic } from 'lucide-react'
import LandingCTA from '@/components/landing/landing-cta'
import { getWaitlistCountAction } from '@/lib/actions/waitlist'

/* ─── Data ─────────────────────────────────────────────────────────────── */

const CALLOUTS = [
  {
    name: 'Adaeze', handle: 'adaeze_ng', initials: 'A', bg: '#1A9E5F',
    text: 'Una don see wetin happen for Lekki today? 😭',
    tag: '#LagosSpeaks', earned: '₦12 earned',
    likes: '1.2K', comments: '84',
  },
  {
    name: 'Kunle B', handle: 'kunleb', initials: 'K', bg: '#7A3A1A',
    text: 'Arsenal vs Chelsea tonight 🔥 who you carry?',
    tag: '#NaijaFootball', earned: '₦87 earned',
    likes: '4.5K', comments: '312',
  },
  {
    name: 'Fatima B', handle: 'fatimab', initials: 'F', bg: '#9E1A5F',
    text: 'First platform where I write in Hausa and actually trend 🙏',
    tag: '#HausaTwitter', earned: '₦34 earned',
    likes: '2.8K', comments: '156',
  },
  {
    name: 'Tunde O', handle: 'tunde_o', initials: 'T', bg: '#1A4A9E',
    text: 'My wallet hit ₦50K this month. Spup is different 🔥',
    tag: '#CreatorEconomy', earned: '₦210 earned',
    likes: '6.1K', comments: '441',
  },
  {
    name: 'Emeka E', handle: 'emekaeze', initials: 'E', bg: '#5A1A9E',
    text: 'Eko bridge go remain forever but this bag? E dey sweet 😂',
    tag: '#LagosLife', earned: '₦55 earned',
    likes: '3.3K', comments: '228',
  },
]

const FEATURES = [
  {
    icon: TrendingUp, title: 'Earn from every post',
    body: '70% of ad revenue goes directly to you, paid in Naira to your bank. No middlemen.',
    wide: true,
  },
  {
    icon: Users, title: 'Built for Naija',
    body: 'Nigerian phone login. Naira payouts. Local trending topics.',
    wide: false,
  },
  {
    icon: Zap, title: 'Tips & subscriptions',
    body: 'Let fans tip you or subscribe for exclusive content.',
    wide: false,
  },
  {
    icon: Shield, title: 'Transparent earnings',
    body: 'Real-time wallet, per-post breakdown. No black boxes.',
    wide: false,
  },
  {
    icon: Globe, title: 'Deep analytics',
    body: 'Audience by state, age, active hours. Know what performs.',
    wide: false,
  },
  {
    icon: Mic, title: 'Spaces & Live',
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

const G = '#1A9E5F'
const GOLD = '#D4A017'
const BG = '#050508'
const BG2 = '#0C0C0F'
const BG3 = '#111115'
const BORDER = 'rgba(255,255,255,0.06)'
const TEXT = '#EDEDEA'
const MUTED = '#52524F'

/* ─── Page ─────────────────────────────────────────────────────────────── */

export default async function LandingPage() {
  const waitlistCount = await getWaitlistCountAction()

  return (
    <div style={{ background: BG, minHeight: '100dvh', fontFamily: "'DM Sans', sans-serif", color: TEXT, overflowX: 'hidden' }}>

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
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px',
        background: 'rgba(5,5,8,0.85)', backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: G, letterSpacing: '-0.02em' }}>
          Spup
        </span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Login — no modal, hover handled inside LandingCTA */}
          <LandingCTA label="Log in" variant="ghost" opensModal={false} href="/login" />
          <LandingCTA label="Join the waitlist" variant="primary" opensModal={true} />
        </div>
      </nav>

      {/* ── HERO — split layout ── */}
      <section style={{
        position: 'relative', zIndex: 1,
        minHeight: '100dvh', display: 'flex', alignItems: 'center',
        maxWidth: 1200, margin: '0 auto',
        padding: '100px 40px 80px',
        gap: 40,
      }}>
        {/* Left copy */}
        <div style={{ flex: '0 0 44%', paddingRight: 48 }}>
          {/* Beta pill */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(26,158,95,0.08)', border: '1px solid rgba(26,158,95,0.2)',
            borderRadius: 100, padding: '5px 14px', marginBottom: 32,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: G, display: 'block', boxShadow: `0 0 8px ${G}` }} />
            <span style={{ fontSize: 12, color: G, fontWeight: 600, letterSpacing: '0.07em' }}>NOW IN BETA — JOIN FREE</span>
          </div>

          <h1 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800,
            fontSize: 'clamp(56px, 6.5vw, 88px)',
            lineHeight: 0.94, letterSpacing: '-0.04em',
            marginBottom: 24, color: TEXT,
          }}>
            Speak up.<br />
            <span style={{ color: G }}>Get paid.</span>
          </h1>

          <p style={{
            fontSize: 'clamp(16px, 1.6vw, 19px)', color: MUTED,
            lineHeight: 1.7, maxWidth: 440, marginBottom: 40,
          }}>
            Nigeria&apos;s social platform where your voice earns real money — 70% of ad revenue paid directly to your bank account in Naira.
          </p>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 48 }}>
            <LandingCTA label="Join the waitlist" variant="primary" opensModal={true} />
            {/* "See how it works" scrolls to features section — does NOT open modal */}
            <LandingCTA label="See how it works" variant="ghost" opensModal={false} href="#features" />
          </div>

          {/* Social proof — real waitlist count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex' }}>
              {['#1A9E5F', '#7A3A1A', '#9E1A5F', '#1A4A9E', '#6A1A9E'].map((bg, i) => (
                <div key={i} style={{
                  width: 32, height: 32, borderRadius: '50%', background: bg,
                  border: `2.5px solid ${BG}`, marginLeft: i === 0 ? 0 : -10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 11, color: 'white',
                }}>
                  {['A', 'K', 'F', 'T', 'E'][i]}
                </div>
              ))}
            </div>
            <div>
              <span style={{ fontSize: 14, color: TEXT, fontWeight: 600 }}>
                {waitlistCount.toLocaleString()}+ creators
              </span>
              <span style={{ fontSize: 14, color: MUTED }}> already on the waitlist</span>
            </div>
          </div>
        </div>

        {/* Right — Floating Post Cards */}
        <div style={{
          flex: '0 0 56%', position: 'relative',
          height: 580,
          overflow: 'visible',
        }}>
          <style>{`
            @keyframes float-0 {
              0%   { transform: translate(0px, 0px) rotate(-1deg); }
              50%  { transform: translate(8px, -14px) rotate(0.5deg); }
              100% { transform: translate(0px, 0px) rotate(-1deg); }
            }
            @keyframes float-1 {
              0%   { transform: translate(0px, 0px) rotate(1.5deg); }
              50%  { transform: translate(-10px, -18px) rotate(0deg); }
              100% { transform: translate(0px, 0px) rotate(1.5deg); }
            }
            @keyframes float-2 {
              0%   { transform: translate(0px, 0px) rotate(-0.5deg); }
              50%  { transform: translate(12px, -12px) rotate(1deg); }
              100% { transform: translate(0px, 0px) rotate(-0.5deg); }
            }
            @keyframes float-3 {
              0%   { transform: translate(0px, 0px) rotate(1deg); }
              50%  { transform: translate(-8px, -16px) rotate(-0.5deg); }
              100% { transform: translate(0px, 0px) rotate(1deg); }
            }
            @keyframes float-4 {
              0%   { transform: translate(0px, 0px) rotate(-1.5deg); }
              50%  { transform: translate(6px, -20px) rotate(-0.5deg); }
              100% { transform: translate(0px, 0px) rotate(-1.5deg); }
            }
          `}</style>

          {/* Ambient glow */}
          <div aria-hidden style={{
            position: 'absolute', top: '40%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 500, height: 400,
            background: 'radial-gradient(ellipse, rgba(26,158,95,0.08) 0%, transparent 65%)',
            borderRadius: '50%', pointerEvents: 'none',
          }} />

          {/* Card 0 — top-left */}
          <div style={{ position: 'absolute', top: 0, left: '0%', width: '62%', animation: 'float-0 7s ease-in-out infinite', animationDelay: '0s' }}>
            <PostCard card={CALLOUTS[0]} border={BORDER} bg3={BG3} muted={MUTED} g={G} text={TEXT} />
          </div>

          {/* Card 1 — upper-right */}
          <div style={{ position: 'absolute', top: 60, left: '36%', width: '64%', animation: 'float-1 8.5s ease-in-out infinite', animationDelay: '-2.8s' }}>
            <PostCard card={CALLOUTS[1]} border={BORDER} bg3={BG3} muted={MUTED} g={G} text={TEXT} />
          </div>

          {/* Card 2 — middle-left */}
          <div style={{ position: 'absolute', top: 190, left: '4%', width: '60%', animation: 'float-2 9s ease-in-out infinite', animationDelay: '-5.1s' }}>
            <PostCard card={CALLOUTS[2]} border={BORDER} bg3={BG3} muted={MUTED} g={G} text={TEXT} />
          </div>

          {/* Card 3 — middle-right */}
          <div style={{ position: 'absolute', top: 310, left: '32%', width: '68%', animation: 'float-3 7.8s ease-in-out infinite', animationDelay: '-1.9s' }}>
            <PostCard card={CALLOUTS[3]} border={BORDER} bg3={BG3} muted={MUTED} g={G} text={TEXT} />
          </div>

          {/* Card 4 — bottom-center */}
          <div style={{ position: 'absolute', top: 430, left: '14%', width: '62%', animation: 'float-4 8s ease-in-out infinite', animationDelay: '-4.4s' }}>
            <PostCard card={CALLOUTS[4]} border={BORDER} bg3={BG3} muted={MUTED} g={G} text={TEXT} />
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <div style={{ position: 'relative', zIndex: 1, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, background: BG2 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
          {[
            { value: '123M', label: 'Nigerian internet users' },
            { value: '70%', label: 'Ad revenue to creators' },
            { value: '₦1K', label: 'Minimum payout' },
            { value: '500', label: 'Characters per post' },
          ].map((s, i) => (
            <div key={i} style={{
              padding: '32px 20px', textAlign: 'center',
              borderRight: i < 3 ? `1px solid ${BORDER}` : 'none',
            }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 34, color: G, letterSpacing: '-0.03em' }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#2E2E2C', marginTop: 5 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FEATURES bento ── */}
      <section id="features" style={{ position: 'relative', zIndex: 1, padding: '100px 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ marginBottom: 56 }}>
            <p style={{ fontSize: 12, color: G, fontWeight: 600, letterSpacing: '0.1em', marginBottom: 10 }}>WHY SPUP</p>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 'clamp(34px, 4.5vw, 54px)', letterSpacing: '-0.03em', lineHeight: 1.0 }}>
              Finally built<br />for us
            </h2>
          </div>
          {/*
            Layout: 3-column grid, no orphan column.
            Row 1: [wide=2] [narrow=1]
            Row 2: [narrow=1] [narrow=1] [narrow=1]
            Row 3: [narrow=1] [wide=2]
            That's 6 cards, perfectly balanced.
          */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {/* Row 1 */}
            <FeatureCard f={FEATURES[0]} wide bg2={BG2} border={BORDER} g={G} text={TEXT} muted={MUTED} />
            <FeatureCard f={FEATURES[1]} wide={false} bg2={BG2} border={BORDER} g={G} text={TEXT} muted={MUTED} />
            {/* Row 2 */}
            <FeatureCard f={FEATURES[2]} wide={false} bg2={BG2} border={BORDER} g={G} text={TEXT} muted={MUTED} />
            <FeatureCard f={FEATURES[3]} wide={false} bg2={BG2} border={BORDER} g={G} text={TEXT} muted={MUTED} />
            <FeatureCard f={FEATURES[4]} wide={false} bg2={BG2} border={BORDER} g={G} text={TEXT} muted={MUTED} />
            {/* Row 3 */}
            <FeatureCard f={FEATURES[5]} wide bg2={BG2} border={BORDER} g={G} text={TEXT} muted={MUTED} />
          </div>
        </div>
      </section>

      {/* ── HOW YOU GET PAID ── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '0 40px 100px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ marginBottom: 56 }}>
            <p style={{ fontSize: 12, color: GOLD, fontWeight: 600, letterSpacing: '0.1em', marginBottom: 10 }}>THE MONEY PART</p>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 'clamp(34px, 4.5vw, 54px)', letterSpacing: '-0.03em', lineHeight: 1.0 }}>
              How you<br />get paid
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
            {[
              { step: '01', title: 'Post content', desc: 'Share your thoughts, videos, hot takes — anything you want. In Pidgin, Yoruba, Igbo, Hausa, or English.' },
              { step: '02', title: 'Build followers', desc: "Reach 500 followers in 90 days to unlock earnings. We'll help you grow with smart analytics." },
              { step: '03', title: 'Ads run nearby', desc: 'We sell ads to Nigerian brands. You keep 70% of what they pay — no hidden cuts, no surprises.' },
              { step: '04', title: 'Withdraw in Naira', desc: 'Hit ₦1,000 minimum? Transfer straight to your bank. Your money, your bank, no stress.' },
            ].map((s, i) => (
              <div key={i} style={{
                background: BG2, border: `1px solid ${BORDER}`,
                borderRadius: 20, padding: '36px 32px',
              }}>
                <div style={{
                  fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 72,
                  color: 'rgba(26,158,95,0.12)', letterSpacing: '-0.05em', lineHeight: 1, marginBottom: 28,
                }}>{s.step}</div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, marginBottom: 14, color: TEXT }}>{s.title}</div>
                <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.75 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '0 40px 100px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ marginBottom: 56 }}>
            <p style={{ fontSize: 12, color: G, fontWeight: 600, letterSpacing: '0.1em', marginBottom: 10 }}>EARLY CREATORS</p>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 'clamp(34px, 4.5vw, 54px)', letterSpacing: '-0.03em', lineHeight: 1.0 }}>
              The people<br />are talking
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} style={{
                background: BG2, border: `1px solid ${BORDER}`,
                borderRadius: 20, padding: 32,
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20,
                  background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.2)',
                  borderRadius: 20, padding: '4px 12px', alignSelf: 'flex-start',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: GOLD, display: 'block' }} />
                  <span style={{ fontSize: 12, color: GOLD, fontWeight: 600 }}>{t.earned}</span>
                </div>
                <p style={{ fontSize: 15, color: '#7A7A72', lineHeight: 1.75, fontStyle: 'italic', flex: 1, marginBottom: 24 }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', background: G, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13, color: 'white',
                  }}>{t.initials}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "'Syne', sans-serif", color: TEXT }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: '#3A3A38' }}>{t.handle} · {t.location}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '0 40px 120px' }}>
        <div style={{
          maxWidth: 860, margin: '0 auto',
          background: BG2, border: '1px solid rgba(26,158,95,0.18)',
          borderRadius: 28, padding: '80px 60px',
          textAlign: 'center', position: 'relative', overflow: 'hidden',
        }}>
          <div aria-hidden style={{
            position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)',
            width: 600, height: 400,
            background: 'radial-gradient(ellipse, rgba(26,158,95,0.1) 0%, transparent 65%)',
            borderRadius: '50%', pointerEvents: 'none',
          }} />
          <p style={{ fontSize: 12, color: G, fontWeight: 600, letterSpacing: '0.1em', marginBottom: 16, position: 'relative' }}>GET EARLY ACCESS</p>
          <h2 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800,
            fontSize: 'clamp(36px, 5vw, 60px)',
            letterSpacing: '-0.04em', lineHeight: 0.95,
            marginBottom: 20, position: 'relative',
          }}>
            Ready to<br />soro soke?
          </h2>
          <p style={{ fontSize: 17, color: MUTED, marginBottom: 40, lineHeight: 1.65, position: 'relative' }}>
            Join {waitlistCount.toLocaleString()}+ Nigerian creators already on the waitlist.<br />Free forever for regular users.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', position: 'relative' }}>
            <LandingCTA label="Join the waitlist" variant="primary" opensModal={true} />
            {/* "See how it works" should NOT open modal */}
            <LandingCTA label="See how it works" variant="ghost" opensModal={false} href="#features" />
          </div>
          <p style={{ fontSize: 12, color: '#242422', marginTop: 20, position: 'relative' }}>
            No credit card required · Nigerian phone number only
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: `1px solid ${BORDER}`, padding: '28px 40px', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: G }}>Spup</span>
          <div style={{ display: 'flex', gap: 24 }}>
            {['Privacy', 'Terms', 'Content Policy', 'Contact'].map((l) => (
              <span key={l} style={{ fontSize: 13, color: '#ffffff', cursor: 'pointer' }}>{l}</span>
            ))}
          </div>
          <span style={{ fontSize: 12, color: '#ffffff' }}>© 2026 Spup Technologies Limited</span>
        </div>
      </footer>

    </div>
  )
}

/* ─── Sub-components ────────────────────────────────────────────────────── */

type PostCardProps = {
  card: typeof CALLOUTS[0]
  border: string
  bg3: string
  muted: string
  g: string
  text: string
}

function PostCard({ card, border, bg3, muted, g, text }: PostCardProps) {
  return (
    <div style={{
      background: bg3,
      border: `1px solid ${border}`,
      borderRadius: 14,
      padding: '12px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
      boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(26,158,95,0.04)',
      backdropFilter: 'blur(8px)',
    }}>
      {/* Author row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', background: card.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: 'white',
          fontFamily: "'Syne', sans-serif", flexShrink: 0,
        }}>{card.initials}</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: text, fontFamily: "'Syne', sans-serif", lineHeight: 1.2 }}>{card.name}</div>
          <div style={{ fontSize: 10, color: muted }}>@{card.handle}</div>
        </div>
      </div>
      {/* Post text */}
      <p style={{ fontSize: 12, color: '#A0A09A', lineHeight: 1.5, margin: 0 }}>
        {card.text} <span style={{ color: g, fontWeight: 600 }}>{card.tag}</span>
      </p>
      {/* Engagement row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: 11, color: muted }}>♡ {card.likes}</span>
        <span style={{ fontSize: 11, color: muted }}>↩ {card.comments}</span>
        <span style={{ fontSize: 11, color: muted }}>⇄ —</span>
      </div>
    </div>
  )
}

type FeatureCardProps = {
  f: typeof FEATURES[0]
  wide: boolean
  bg2: string
  border: string
  g: string
  text: string
  muted: string
}

function FeatureCard({ f, wide, bg2, border, g, text, muted }: FeatureCardProps) {
  return (
    <div style={{
      gridColumn: wide ? 'span 2' : 'span 1',
      background: bg2, border: `1px solid ${border}`,
      borderRadius: 20, padding: wide ? '36px 40px' : '28px 28px',
      display: 'flex',
      flexDirection: wide ? 'row' : 'column',
      alignItems: wide ? 'center' : 'flex-start',
      gap: wide ? 32 : 0,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 13, flexShrink: 0,
        background: 'rgba(26,158,95,0.08)', border: '1px solid rgba(26,158,95,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: wide ? 0 : 20,
      }}>
        <f.icon size={22} color={g} strokeWidth={1.8} />
      </div>
      <div>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: wide ? 20 : 17, marginBottom: 10, color: text }}>{f.title}</h3>
        <p style={{ fontSize: 15, color: muted, lineHeight: 1.7, maxWidth: 320 }}>{f.body}</p>
      </div>
    </div>
  )
}