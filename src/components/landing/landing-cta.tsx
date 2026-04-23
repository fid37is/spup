// src/components/landing/landing-cta.tsx
'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useWaitlist } from './waitlist-context'

interface LandingCTAProps {
  label?: string
  variant?: 'primary' | 'ghost'
  opensModal?: boolean
  href?: string
}

export default function LandingCTA({
  label = 'Join the waitlist',
  variant = 'primary',
  opensModal = true,
  href = '/',
}: LandingCTAProps) {
  const { openModal } = useWaitlist()

  const primaryStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 10,
    background: '#1A9E5F', color: 'white', border: 'none',
    padding: '14px 28px', borderRadius: 10,
    fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16,
    cursor: 'pointer', textDecoration: 'none',
    transition: 'background 0.18s, transform 0.15s, box-shadow 0.18s',
  }

  const ghostStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    border: '1px solid rgba(255,255,255,0.12)', color: '#8A8A85',
    background: 'none', padding: '14px 28px', borderRadius: 10,
    fontSize: 15, cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif", textDecoration: 'none',
    transition: 'border-color 0.18s, color 0.18s',
  }

  const style = variant === 'primary' ? primaryStyle : ghostStyle

  const hoverOn = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget
    if (variant === 'primary') {
      el.style.background = '#158450'
      el.style.transform = 'translateY(-1px)'
      el.style.boxShadow = '0 8px 24px rgba(26,158,95,0.35)'
    } else {
      el.style.borderColor = 'rgba(255,255,255,0.28)'
      el.style.color = '#EDEDEA'
    }
  }

  const hoverOff = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget
    if (variant === 'primary') {
      el.style.background = '#1A9E5F'
      el.style.transform = 'translateY(0)'
      el.style.boxShadow = 'none'
    } else {
      el.style.borderColor = 'rgba(255,255,255,0.12)'
      el.style.color = '#8A8A85'
    }
  }

  if (!opensModal) {
    return (
      <Link href={href} style={style} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
        {label}
        {variant === 'primary' && <ArrowRight size={18} />}
      </Link>
    )
  }

  return (
    <button onClick={openModal} style={style} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
      {label}
      {variant === 'primary' && <ArrowRight size={18} />}
    </button>
  )
}