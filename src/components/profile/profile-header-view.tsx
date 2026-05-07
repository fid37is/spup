// src/components/profile/profile-header-view.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  BadgeCheck, MapPin, Globe, Calendar, Cake,
  ChevronDown, Shield, Phone, Briefcase,
} from 'lucide-react'

interface ViewProps {
  profile: {
    display_name: string
    username: string
    bio: string | null
    location: string | null
    website_url: string | null
    is_monetised: boolean
    verification_tier: string
    created_at: string
    occupation?: string | null
    date_of_birth?: string | null
    birthday_visibility?: string | null
    email?: string | null
    phone_number?: string | null
    bvn_verified?: boolean
  }
  stats: { following: string; followers: string; mutuals: string }
  isOwner: boolean
  showBirthday: boolean
}

const ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 14, color: 'var(--color-text-muted)',
  marginBottom: 6,
}

export default function ProfileHeaderView({
  profile, stats, isOwner, showBirthday,
}: ViewProps) {
  const [expanded, setExpanded] = useState(false)

  const joinDate = new Date(profile.created_at).toLocaleDateString('en-NG', {
    month: 'long', year: 'numeric',
  })

  const connectBase = `/connections/${profile.username}`

  return (
    <div>
      {/* Name */}
      <h1 style={{
        fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22,
        color: 'var(--color-text-primary)', letterSpacing: '-0.01em',
        margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      }}>
        {profile.display_name}
        {profile.verification_tier !== 'none' && <BadgeCheck size={18} color="var(--color-brand)" />}
        {profile.is_monetised && (
          <span style={{ fontSize: 10, background: 'var(--color-gold)', color: '#000', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
            PRO
          </span>
        )}
      </h1>

      {/* Username */}
      <p style={{ fontSize: 15, color: 'var(--color-text-muted)', margin: '0 0 10px' }}>
        @{profile.username}
      </p>

      {/* Bio */}
      {profile.bio && (
        <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', lineHeight: 1.65, margin: '0 0 10px', wordBreak: 'break-word' }}>
          {profile.bio}
        </p>
      )}

      {/* Info — two rows like the reference */}
      {/* Row 1: account type · location · website */}
      {(profile.occupation || profile.location || profile.website_url) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 4 }}>
          {profile.occupation && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, color: 'var(--color-text-muted)' }}>
              <Briefcase size={14} strokeWidth={1.8} />{profile.occupation}
            </span>
          )}
          {profile.location && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, color: 'var(--color-text-muted)' }}>
              <MapPin size={14} strokeWidth={1.8} />{profile.location}
            </span>
          )}
          {profile.website_url && (
            <a href={profile.website_url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, color: 'var(--color-brand)', textDecoration: 'none' }}>
              <Globe size={14} strokeWidth={1.8} />
              {profile.website_url.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>
      )}

      {/* Row 2: birthday · joined · chevron */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 4 }}>
        {(isOwner || showBirthday) && profile.date_of_birth && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, color: 'var(--color-text-muted)' }}>
            <Cake size={14} strokeWidth={1.8} />
            Born {new Date(profile.date_of_birth).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, color: 'var(--color-text-muted)' }}>
          <Calendar size={14} strokeWidth={1.8} />Joined {joinDate}
        </span>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', flexShrink: 0 }}
        >
          <ChevronDown size={16} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }} />
        </button>
      </div>

      {/* Expanded — owner-only details not shown in default rows */}
      {expanded && isOwner && (
        <div style={{
          margin: '6px 0 4px',
          padding: '12px 16px',
          background: 'var(--color-surface-2)',
          borderRadius: 12,
          border: '1px solid var(--color-border)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {profile.email && (
            <div style={ROW}>
              <Shield size={15} color="var(--color-text-muted)" strokeWidth={1.8} />
              <span>{profile.email}</span>
            </div>
          )}
          <div style={{ ...ROW, color: profile.bvn_verified ? 'var(--color-brand)' : 'var(--color-text-muted)' }}>
            <Phone size={15} strokeWidth={1.8} color={profile.bvn_verified ? 'var(--color-brand)' : 'var(--color-text-muted)'} />
            <span>{profile.bvn_verified ? 'Phone & BVN verified' : 'Phone & BVN not verified'}</span>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 20, margin: '12px 0 4px' }}>
        {[
          { value: stats.following, label: 'Following', tab: 'following' },
          { value: stats.followers, label: 'Followers',  tab: 'followers' },
          { value: stats.mutuals,  label: 'Mutuals',    tab: 'mutuals'   },
        ].map(({ value, label, tab }) => (
          <Link
            key={tab}
            href={`${connectBase}?tab=${tab}`}
            style={{ display: 'flex', alignItems: 'baseline', gap: 4, textDecoration: 'none' }}
          >
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--color-text-primary)' }}>
              {value}
            </span>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}