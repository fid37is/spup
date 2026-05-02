'use client'

/**
 * EditProfileModal
 * ─────────────────
 * Full-screen modal for editing profile appearance (name, bio, location,
 * website). This is deliberately separate from /settings — settings handles
 * account security/privacy; this handles how your profile looks.
 *
 * Opened via the "Edit profile" button on the profile page.
 */

import { useState, useTransition, useEffect } from 'react'
import { X, Check, Loader } from 'lucide-react'
import { updateProfileAction } from '@/lib/actions/profiles'

interface EditProfileModalProps {
  profile: {
    display_name: string
    bio: string | null
    location: string | null
    website_url: string | null
  }
  onClose: () => void
  onSaved?: () => void   // called after a successful save so the page can refresh
}

const INP: React.CSSProperties = {
  width: '100%',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  padding: '12px 14px',
  color: 'var(--color-text-primary)',
  fontSize: 15,
  outline: 'none',
  fontFamily: "'DM Sans', sans-serif",
  transition: 'border-color 0.15s',
}

const LABEL: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  letterSpacing: '0.04em',
  display: 'block',
  marginBottom: 6,
}

export default function EditProfileModal({ profile, onClose, onSaved }: EditProfileModalProps) {
  const [displayName, setDisplayName] = useState(profile.display_name || '')
  const [bio,         setBio]         = useState(profile.bio || '')
  const [location,    setLocation]    = useState(profile.location || '')
  const [website,     setWebsite]     = useState(profile.website_url || '')
  const [error,       setError]       = useState('')
  const [isPending,   startT]         = useTransition()

  // Trap scroll behind modal
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSave() {
    if (!displayName.trim()) { setError('Display name is required.'); return }
    setError('')
    startT(async () => {
      const result = await updateProfileAction({
        display_name: displayName.trim(),
        bio:          bio.trim() || undefined,
        location:     location.trim() || undefined,
        website_url:  website.trim() || undefined,
      })
      if (result.error) { setError(result.error); return }
      onSaved?.()
      onClose()
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'var(--overlay-bg)',
        }}
      />

      {/* Sheet — full-width on mobile, centred card on desktop */}
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 301,
        display: 'flex',
        alignItems: 'flex-end',          // bottom-sheet on mobile
        justifyContent: 'center',
        padding: '0 0 0 0',
      }}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 560,
            maxHeight: '92dvh',
            overflowY: 'auto',
            background: 'var(--color-surface)',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {/* Header row */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 20px 16px',
            borderBottom: '1px solid var(--color-border)',
            position: 'sticky', top: 0, zIndex: 10,
            background: 'var(--color-surface)',
          }}>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: '50%',
                color: 'var(--color-text-primary)',
              }}
            >
              <X size={20} />
            </button>

            <h2 style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17,
              color: 'var(--color-text-primary)', margin: 0,
            }}>
              Edit profile
            </h2>

            <button
              onClick={handleSave}
              disabled={isPending || !displayName.trim()}
              style={{
                background: 'var(--color-brand)', color: 'white',
                border: 'none', borderRadius: 20, padding: '8px 18px',
                fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
                cursor: isPending || !displayName.trim() ? 'not-allowed' : 'pointer',
                opacity: isPending || !displayName.trim() ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'opacity 0.15s',
              }}
            >
              {isPending
                ? <Loader size={14} style={{ animation: 'spin .7s linear infinite' }} />
                : <Check size={14} />}
              Save
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              margin: '12px 20px 0',
              padding: '10px 14px', borderRadius: 10,
              background: 'var(--color-error-muted)',
              border: '1px solid var(--color-error-border)',
              fontSize: 14, color: 'var(--color-error)',
            }}>
              {error}
            </div>
          )}

          {/* Form */}
          <div style={{ padding: '20px 20px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Display name */}
            <div>
              <label style={LABEL}>
                Display name <span style={{ color: 'var(--color-error)', marginLeft: 2 }}>*</span>
              </label>
              <input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                maxLength={50}
                placeholder="Your name"
                style={INP}
              />
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                {50 - displayName.length} characters remaining
              </p>
            </div>

            {/* Bio */}
            <div>
              <label style={LABEL}>
                Bio
              </label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                maxLength={160}
                rows={3}
                placeholder="Tell people about yourself"
                style={{ ...INP, resize: 'none', lineHeight: 1.5 }}
              />
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                {160 - bio.length} characters remaining
              </p>
            </div>

            {/* Location */}
            <div>
              <label style={LABEL}>Location</label>
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                maxLength={60}
                placeholder="Lagos, Nigeria"
                style={INP}
              />
            </div>

            {/* Website */}
            <div>
              <label style={LABEL}>Website</label>
              <input
                value={website}
                onChange={e => setWebsite(e.target.value)}
                maxLength={100}
                type="url"
                placeholder="https://yoursite.com"
                inputMode="url"
                style={INP}
              />
            </div>

          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}