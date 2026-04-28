'use client'

import { useState } from 'react'
import {
    Smartphone, Bell, WifiOff,
    Home, Search, Wallet, User,
    Heart, Repeat2, MessageCircle, TrendingUp, Flame,
} from 'lucide-react'

export default function LandingMobileSection() {
    const [toastVisible, setToastVisible] = useState(false)
    const [toastPlatform, setToastPlatform] = useState('')

    function handleAppClick(platform: string) {
        setToastPlatform(platform)
        setToastVisible(true)
        setTimeout(() => setToastVisible(false), 3000)
    }

    return (
        <section style={{ position: 'relative', zIndex: 1, padding: '100px 40px' }}>
            <style>{`
        .app-section-inner {
          max-width: 1100px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 60px;
          align-items: center;
        }
        .app-mockup-wrap {
          position: relative;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 60px 40px;
        }
        .app-btn {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 28px;
          border-radius: 16px;
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
          min-width: 190px;
          position: relative;
          overflow: hidden;
        }
        .app-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, var(--color-brand-muted), transparent);
          opacity: 0;
          transition: opacity 0.2s;
        }
        .app-btn:hover::before { opacity: 1; }
        .app-btn:hover {
          border-color: var(--color-brand-border);
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(26,158,95,0.12);
        }
        .app-btn:active { transform: translateY(0); }
        .phone-glow {
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 320px;
          height: 220px;
          background: radial-gradient(ellipse, rgba(26,158,95,0.2) 0%, transparent 70%);
          pointer-events: none;
          border-radius: 50%;
          filter: blur(24px);
          z-index: 0;
        }
        .toast {
          position: fixed;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--color-surface-raised);
          border: 1px solid var(--color-brand-border);
          border-radius: 14px;
          padding: 14px 24px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          color: var(--color-text-primary);
          z-index: 9999;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          animation: toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards;
          white-space: nowrap;
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .screen-shimmer {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 40%;
          background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%);
          border-radius: 44px 44px 0 0;
          pointer-events: none;
          z-index: 2;
        }
        .float-badge {
          position: absolute;
          background: var(--color-surface-raised);
          border: 1px solid var(--color-border-light);
          border-radius: 14px;
          padding: 10px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          z-index: 10;
        }
        .float-badge-1 { animation: floatA 3.5s ease-in-out infinite; }
        .float-badge-2 { animation: floatB 3.5s ease-in-out infinite; animation-delay: 1.5s; }
        @keyframes floatA {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-8px); }
        }
        @keyframes floatB {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-6px); }
        }
        @media (max-width: 767px) {
          .app-section-inner { grid-template-columns: 1fr !important; gap: 48px !important; }
          .app-mockup-wrap { padding: 60px 20px; }
          .app-btns { flex-direction: column; }
          section { padding: 60px 20px !important; }
        }
      `}</style>

            <div className="app-section-inner">

                {/* ── Left ── */}
                <div>
                    <p style={{
                        fontSize: 12, color: 'var(--color-brand)', fontWeight: 600,
                        letterSpacing: '0.1em', marginBottom: 16,
                    }}>
                        TAKE SPUP EVERYWHERE
                    </p>

                    <h2 style={{
                        fontFamily: "'Syne', sans-serif", fontWeight: 800,
                        fontSize: 'clamp(34px, 4.5vw, 54px)',
                        letterSpacing: '-0.03em', lineHeight: 1.0,
                        color: 'var(--color-text-primary)', marginBottom: 20,
                    }}>
                        Your earnings,<br />
                        <span style={{ color: 'var(--color-brand)' }}>in your pocket.</span>
                    </h2>

                    <p style={{
                        fontSize: 16, color: 'var(--color-text-secondary)',
                        lineHeight: 1.75, marginBottom: 40, maxWidth: 420,
                    }}>
                        Post from anywhere, track your Naira earnings in real-time, and withdraw to your bank - all from the Spup mobile app.
                    </p>

                    {/* Feature pills */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 44 }}>
                        {[
                            { icon: TrendingUp, label: 'Real-time earnings' },
                            { icon: Bell, label: 'Push notifications' },
                            { icon: WifiOff, label: 'Offline drafts' },
                        ].map(({ icon: Icon, label }) => (
                            <div key={label} style={{
                                padding: '7px 14px', borderRadius: 100,
                                background: 'var(--color-brand-muted)',
                                border: '1px solid var(--color-brand-border)',
                                fontSize: 12, fontWeight: 600, color: 'var(--color-brand)',
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                                <Icon size={12} strokeWidth={2} />
                                {label}
                            </div>
                        ))}
                    </div>

                    {/* Store buttons */}
                    <div className="app-btns" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <button className="app-btn" onClick={() => handleAppClick('iOS')}>
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="var(--color-text-primary)" style={{ flexShrink: 0 }}>
                                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                            </svg>
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 1 }}>Download on the</div>
                                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)' }}>App Store</div>
                            </div>
                        </button>

                        <button className="app-btn" onClick={() => handleAppClick('Android')}>
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="var(--color-text-primary)" style={{ flexShrink: 0 }}>
                                <path d="M17.523 15.341a.42.42 0 01-.421.421H6.898a.42.42 0 01-.421-.421v-6.56l5.045-2.914 5.045 2.914v6.56zm-9.66-9.615l1.17-2.025a.24.24 0 01.327-.088.24.24 0 01.088.327l-1.17 2.025A6.14 6.14 0 0112 5.617a6.14 6.14 0 013.722 1.348l-1.17-2.025a.24.24 0 01.088-.327.24.24 0 01.327.088l1.17 2.025A6.175 6.175 0 0119.05 9.6H4.95a6.175 6.175 0 012.913-3.874zM10.5 8.1a.6.6 0 110-1.2.6.6 0 010 1.2zm3 0a.6.6 0 110-1.2.6.6 0 010 1.2zM5.656 16.5A1.656 1.656 0 014 14.844V9.6h1.2v5.244c0 .251.205.456.456.456h.656V9.6H7.5v7.5H6.856A1.2 1.2 0 015.656 16.5zm12.688 0A1.2 1.2 0 0117.144 17.1H16.5V9.6h1.188v5.7h.656a.456.456 0 00.456-.456V9.6H20v5.244A1.656 1.656 0 0118.344 16.5zM9.9 17.1v2.1a.9.9 0 01-1.8 0V17.1h1.8zm6 0v2.1a.9.9 0 01-1.8 0V17.1h1.8z" />
                            </svg>
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 1 }}>Get it on</div>
                                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--color-text-primary)' }}>Google Play</div>
                            </div>
                        </button>
                    </div>
                </div>

                {/* ── Right: phone mockup ── */}
                <div className="app-mockup-wrap">
                    <div className="phone-glow" />

                    {/* Badge — earnings — top left of mockup area */}
                    <div className="float-badge float-badge-1" style={{ top: 20, left: 0 }}>
                        <div style={{
                            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                            background: 'linear-gradient(135deg, var(--color-brand-dim), var(--color-brand))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <TrendingUp size={16} color="white" strokeWidth={2.5} />
                        </div>
                        <div>
                            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>Today&apos;s earnings</div>
                            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Syne', sans-serif", color: 'var(--color-brand)' }}>+₦3,420</div>
                        </div>
                    </div>

                    {/* Badge — trending — bottom right of mockup area */}
                    <div className="float-badge float-badge-2" style={{ bottom: 20, right: 0 }}>
                        <div style={{
                            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                            background: 'rgba(212,160,23,0.15)',
                            border: '1px solid var(--color-gold-border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Flame size={16} color="var(--color-gold)" strokeWidth={2} />
                        </div>
                        <div>
                            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>Post trending</div>
                            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Syne', sans-serif", color: 'var(--color-gold)' }}>12.4K views</div>
                        </div>
                    </div>

                    {/* Phone frame */}
                    <div style={{
                        width: 300, height: 600, borderRadius: 44,
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border-light)',
                        position: 'relative', overflow: 'hidden', zIndex: 5,
                        boxShadow: '0 40px 80px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.06)',
                    }}>
                        <div className="screen-shimmer" />

                        {/* Notch */}
                        <div style={{
                            position: 'absolute', top: 14, left: '50%',
                            transform: 'translateX(-50%)',
                            width: 96, height: 26,
                            background: 'var(--color-bg)',
                            borderRadius: 20, zIndex: 10,
                        }} />

                        {/* Screen */}
                        <div style={{ position: 'absolute', inset: 0, background: 'var(--color-bg)', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ height: 54, flexShrink: 0 }} />

                            {/* Header */}
                            <div style={{
                                padding: '12px 16px', borderBottom: '1px solid var(--color-border)',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
                            }}>
                                <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--color-brand)' }}>Spup</span>
                                <div style={{
                                    width: 30, height: 30, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, var(--color-brand-dim), var(--color-brand))',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 10, fontWeight: 800, color: 'white', fontFamily: "'Syne', sans-serif",
                                }}>SO</div>
                            </div>

                            {/* Tabs */}
                            <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
                                {['For You', 'Following', 'Mutuals'].map((tab, i) => (
                                    <div key={tab} style={{
                                        flex: 1, padding: '10px 0', textAlign: 'center',
                                        fontSize: 10, fontWeight: 700, fontFamily: "'Syne', sans-serif",
                                        color: i === 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                        borderBottom: i === 0 ? '2px solid var(--color-brand)' : '2px solid transparent',
                                    }}>{tab}</div>
                                ))}
                            </div>

                            {/* Posts */}
                            {[
                                { initials: 'CO', name: 'Chioma', handle: '@chioma', text: 'Just got my ₦45K payout from Spup. The hustle is paying off finally!', time: '2m', color: '#1A9E5F', likes: '342', comments: '28', reposts: '14' },
                                { initials: 'EE', name: 'Emeka', handle: '@emekaeze', text: 'My analytics show Lagos people dey vibe with my content. Abuja una dey try.', time: '15m', color: '#7A3A1A', likes: '128', comments: '9', reposts: '6' },
                                { initials: 'FB', name: 'Fatima', handle: '@fatimab', text: 'First platform wey understand say Hausa content dey trend. E don do!', time: '1h', color: '#1A4A9E', likes: '89', comments: '5', reposts: '3' },
                                { initials: 'CO', name: 'Chioma', handle: '@chioma', text: 'Just got my ₦45K payout from Spup. The hustle is paying off finally!', time: '2m', color: '#1A9E5F', likes: '342', comments: '28', reposts: '14' },
                            ].map((post, i) => (
                                <div key={i} style={{
                                    padding: '12px 14px', borderBottom: '1px solid var(--color-border)',
                                    display: 'flex', gap: 10, flexShrink: 0,
                                }}>
                                    <div style={{
                                        width: 30, height: 30, borderRadius: '50%',
                                        background: post.color, flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 10, fontWeight: 800, color: 'white', fontFamily: "'Syne', sans-serif",
                                    }}>{post.initials}</div>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif" }}>{post.name}</span>
                                            <span style={{ fontSize: 9, color: 'var(--color-text-secondary)' }}>{post.handle} · {post.time}</span>
                                        </div>
                                        <p style={{ fontSize: 10, color: 'var(--color-text-primary)', lineHeight: 1.55, margin: '0 0 8px', opacity: 0.85 }}>{post.text}</p>
                                        <div style={{ display: 'flex', gap: 14 }}>
                                            {[
                                                { Icon: MessageCircle, val: post.comments },
                                                { Icon: Repeat2, val: post.reposts },
                                                { Icon: Heart, val: post.likes },
                                            ].map(({ Icon, val }, j) => (
                                                <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Icon size={10} color="var(--color-text-secondary)" />
                                                    <span style={{ fontSize: 9, color: 'var(--color-text-secondary)' }}>{val}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Bottom nav */}
                        <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            height: 60, background: 'var(--color-surface)',
                            borderTop: '1px solid var(--color-border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 8px',
                        }}>
                            {[
                                { Icon: Home, active: true },
                                { Icon: Search, active: false },
                                { Icon: Bell, active: false },
                                { Icon: Wallet, active: false },
                                { Icon: User, active: false },
                            ].map(({ Icon, active }, i) => (
                                <div key={i} style={{
                                    width: 38, height: 38,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: 10,
                                    background: active ? 'var(--color-brand-muted)' : 'transparent',
                                }}>
                                    <Icon size={18} color={active ? 'var(--color-brand)' : 'var(--color-text-secondary)'} strokeWidth={active ? 2.5 : 1.8} />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Toast */}
            {toastVisible && (
                <div className="toast">
                    <Smartphone size={16} color="var(--color-brand)" />
                    <span><strong>{toastPlatform} app</strong> coming soon — we&apos;ll notify you at launch!</span>
                </div>
            )}
        </section>
    )
}