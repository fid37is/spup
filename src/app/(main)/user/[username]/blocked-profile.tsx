'use client'

// src/app/(main)/user/[username]/blocked-profile.tsx
//
// Shown instead of a 404 when the profile owner has blocked the viewer.
// Deliberately renders only name, handle and avatar - no bio, counts, posts
// or follow controls - so nothing about the account leaks past the block.
// All copy goes through t() (keys in src/locales/en.json).
import { Hand } from 'lucide-react'
import BackButton from '@/components/ui/back-button'
import { useTranslation } from '@/lib/i18n/language-context'

interface Props {
  displayName: string
  username: string
  avatarUrl: string | null
}

const AVATAR_COLORS = ['#1A7A4A', '#7A3A1A', '#1A4A7A', '#4A1A7A', '#7A1A4A']

export default function BlockedProfile({ displayName, username, avatarUrl }: Props) {
  const { t } = useTranslation()
  const bg = AVATAR_COLORS[displayName.charCodeAt(0) % AVATAR_COLORS.length]

  return (
    <div>
      {/* Sticky header, same as the connections page */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 20px', height: 56,
      }}>
        <BackButton fallbackHref="/feed" label={t('common.back')} />
        <div>
          <h1 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17,
            color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.2,
          }}>
            {displayName}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
            @{username}
          </p>
        </div>
      </div>

      {/* Who this is */}
      <div style={{ padding: '28px 20px 0' }}>
        <div style={{
          width: 88, height: 88, borderRadius: '50%',
          background: avatarUrl ? 'transparent' : bg,
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 30, color: 'white',
        }}>
          {avatarUrl
            ? <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : displayName.slice(0, 2).toUpperCase()}
        </div>
        <p style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20,
          color: 'var(--color-text-primary)', margin: '14px 0 0',
        }}>
          {displayName}
        </p>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
          @{username}
        </p>
      </div>

      {/* The block message, centered */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center', padding: '56px 28px 48px',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--color-error) 14%, transparent)',
          color: 'var(--color-error)',
        }}>
          <Hand size={30} strokeWidth={1.75} aria-hidden="true" />
        </div>

        <h2 style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 26,
          letterSpacing: '-0.01em', lineHeight: 1.15,
          color: 'var(--color-text-primary)', margin: '20px 0 0',
        }}>
          {t('profile.blocked_by_title')}
        </h2>
        <p style={{
          maxWidth: 320, fontSize: 15, lineHeight: 1.5,
          color: 'var(--color-text-secondary)', margin: '8px 0 0',
        }}>
          {t('profile.blocked_by_body', { username })}
        </p>
      </div>
    </div>
  )
}