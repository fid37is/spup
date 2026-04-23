// Pure presentational — no client directive needed (no interactivity)

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

const BG3   = 'var(--color-surface-2)'
const BORDER = 'var(--color-border)'
const G      = 'var(--color-brand)'
const TEXT   = 'var(--color-text-primary)'
const MUTED  = 'var(--color-text-muted)'

/* ─── Individual card ────────────────────────────────────────────────────── */
type PostCardProps = { card: typeof CALLOUTS[0] }

function PostCard({ card }: PostCardProps) {
  return (
    <div style={{
      background: BG3,
      border: `1px solid ${BORDER}`,
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
          <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, fontFamily: "'Syne', sans-serif", lineHeight: 1.2 }}>{card.name}</div>
          <div style={{ fontSize: 10, color: MUTED }}>@{card.handle}</div>
        </div>
      </div>

      {/* Post text */}
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0 }}>
        {card.text}{' '}
        <span style={{ color: G, fontWeight: 600 }}>{card.tag}</span>
      </p>

      {/* Engagement row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: 11, color: MUTED }}>♡ {card.likes}</span>
        <span style={{ fontSize: 11, color: MUTED }}>↩ {card.comments}</span>
        <span style={{ fontSize: 11, color: MUTED }}>⇄ —</span>
      </div>
    </div>
  )
}

/* ─── Hero Cards cluster ─────────────────────────────────────────────────── */
export default function LandingHeroCards() {
  return (
    <div className="hero-right">
      <style>{`
        @keyframes float-0 {
          0%   { transform: translate(0px,   0px)  rotate(-1deg);   }
          50%  { transform: translate(8px,  -14px) rotate(0.5deg);  }
          100% { transform: translate(0px,   0px)  rotate(-1deg);   }
        }
        @keyframes float-1 {
          0%   { transform: translate(0px,   0px)  rotate(1.5deg);  }
          50%  { transform: translate(-10px,-18px) rotate(0deg);    }
          100% { transform: translate(0px,   0px)  rotate(1.5deg);  }
        }
        @keyframes float-2 {
          0%   { transform: translate(0px,   0px)  rotate(-0.5deg); }
          50%  { transform: translate(12px, -12px) rotate(1deg);    }
          100% { transform: translate(0px,   0px)  rotate(-0.5deg); }
        }
        @keyframes float-3 {
          0%   { transform: translate(0px,   0px)  rotate(1deg);    }
          50%  { transform: translate(-8px, -16px) rotate(-0.5deg); }
          100% { transform: translate(0px,   0px)  rotate(1deg);    }
        }
        @keyframes float-4 {
          0%   { transform: translate(0px,   0px)  rotate(-1.5deg); }
          50%  { transform: translate(6px,  -20px) rotate(-0.5deg); }
          100% { transform: translate(0px,   0px)  rotate(-1.5deg); }
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
        <PostCard card={CALLOUTS[0]} />
      </div>

      {/* Card 1 — upper-right */}
      <div style={{ position: 'absolute', top: 60, left: '36%', width: '64%', animation: 'float-1 8.5s ease-in-out infinite', animationDelay: '-2.8s' }}>
        <PostCard card={CALLOUTS[1]} />
      </div>

      {/* Card 2 — middle-left */}
      <div style={{ position: 'absolute', top: 190, left: '4%', width: '60%', animation: 'float-2 9s ease-in-out infinite', animationDelay: '-5.1s' }}>
        <PostCard card={CALLOUTS[2]} />
      </div>

      {/* Card 3 — middle-right */}
      <div style={{ position: 'absolute', top: 310, left: '32%', width: '68%', animation: 'float-3 7.8s ease-in-out infinite', animationDelay: '-1.9s' }}>
        <PostCard card={CALLOUTS[3]} />
      </div>

      {/* Card 4 — bottom-center */}
      <div style={{ position: 'absolute', top: 430, left: '14%', width: '62%', animation: 'float-4 8s ease-in-out infinite', animationDelay: '-4.4s' }}>
        <PostCard card={CALLOUTS[4]} />
      </div>
    </div>
  )
}