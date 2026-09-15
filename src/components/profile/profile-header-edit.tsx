// src/components/profile/profile-header-edit.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader, Check, X } from 'lucide-react'
import { updateProfileAction } from '@/lib/actions/profiles'

// Username and Phone & BVN used to live here as an "Account" section, but
// they're account-identity/security fields, not profile display fields —
// and Phone & BVN did a hard `window.location.href` navigation away from
// this form, silently discarding any unsaved display-name/bio/etc. edits
// with no warning. Both now live in Settings (Account section, next to
// Change password) where the rest of the app's account-level actions
// already are.
interface EditProps {
  profile: {
    display_name: string
    bio: string | null
    location: string | null
    website_url: string | null
    occupation?: string | null
    date_of_birth?: string | null
    birthday_visibility?: string | null
  }
  onCancel: () => void
  onSaved: () => void
}

const INP: React.CSSProperties = {
  width: '100%', background: 'var(--input-bg)',
  border: '1px solid var(--color-border)', borderRadius: 10,
  padding: '10px 13px', color: 'var(--color-text-primary)',
  fontSize: 15, outline: 'none',
  fontFamily: "'DM Sans', sans-serif",
  WebkitAppearance: 'none', appearance: 'none', boxSizing: 'border-box',
}

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.07em',
  textTransform: 'uppercase', color: 'var(--color-text-muted)',
  display: 'block', marginBottom: 6,
}

export default function ProfileHeaderEdit({ profile, onCancel, onSaved }: EditProps) {
  const router = useRouter()
  const [isPending, startT] = useTransition()

  // Profile fields
  const [displayName,  setDisplayName]  = useState(profile.display_name ?? '')
  const [bio,          setBio]          = useState(profile.bio ?? '')
  const [occupation,   setOccupation]   = useState(profile.occupation ?? '')
  const [location,     setLocation]     = useState(profile.location ?? '')
  const [website,      setWebsite]      = useState(profile.website_url ?? '')
  const [dob,          setDob]          = useState(
    profile.date_of_birth
      ? new Date(profile.date_of_birth).toISOString().split('T')[0]
      : ''
  )
  const [birthdayVis, setBirthdayVis] = useState<'everyone' | 'followers' | 'only_me'>(
    (profile.birthday_visibility as any) ?? 'followers'
  )
  const [saveError, setSaveError] = useState('')

  function handleSave() {
    if (!displayName.trim()) { setSaveError('Display name is required'); return }
    setSaveError('')
    startT(async () => {
      const r = await updateProfileAction({
        display_name:        displayName.trim(),
        bio:                 bio.trim()        || undefined,
        occupation:          occupation.trim() || undefined,
        location:            location.trim()   || undefined,
        website_url:         website.trim()    || undefined,
        date_of_birth:       dob               || undefined,
        birthday_visibility: birthdayVis,
      })
      if (r.error) { setSaveError(r.error); return }
      router.refresh()
      onSaved()
    })
  }

  const maxDob = new Date(Date.now() - 13 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  return (
    <div style={{ padding: '0 16px' }}>

      {/* Save error */}
      {saveError && (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 10,
          background: 'var(--color-error-muted)', border: '1px solid var(--color-error-border)',
          fontSize: 13, color: 'var(--color-error)',
        }}>
          {saveError}
        </div>
      )}

      {/* ── Profile fields ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>

        {/* Display name */}
        <div>
          <label style={LABEL}>Display name <span style={{ color: 'var(--color-error)' }}>*</span></label>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={50} placeholder="Your name" style={INP} />
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>{50 - displayName.length} left</p>
        </div>

        {/* Bio */}
        <div>
          <label style={LABEL}>Bio</label>
          <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={160} rows={3}
            placeholder="Tell people about yourself"
            style={{ ...INP, resize: 'none', lineHeight: 1.55 }} />
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>{160 - bio.length} left</p>
        </div>

        {/* Account type — dropdown like X/Twitter */}
        <div>
          <label style={LABEL}>Account type</label>
          <select
            value={occupation}
            onChange={e => setOccupation(e.target.value)}
            style={{ ...INP, cursor: 'pointer' }}
          >
            <option value="">Select account type…</option>
            <optgroup label="Creator">
              <option value="Content Creator">Content Creator</option>
              <option value="Blogger">Blogger</option>
              <option value="Vlogger">Vlogger</option>
              <option value="Podcaster">Podcaster</option>
              <option value="Influencer">Influencer</option>
            </optgroup>
            <optgroup label="Entertainment">
              <option value="Musician / Artist">Musician / Artist</option>
              <option value="Actor / Actress">Actor / Actress</option>
              <option value="Comedian">Comedian</option>
              <option value="Media Personality">Media Personality</option>
              <option value="Filmmaker">Filmmaker</option>
            </optgroup>
            <optgroup label="Business">
              <option value="Entrepreneur">Entrepreneur</option>
              <option value="Business">Business</option>
              <option value="Brand">Brand</option>
              <option value="Organisation">Organisation</option>
            </optgroup>
            <optgroup label="Professional">
              <option value="Software Engineer">Software Engineer</option>
              <option value="Product Manager">Product Manager</option>
              <option value="Designer">Designer</option>
              <option value="Journalist">Journalist</option>
              <option value="Author / Writer">Author / Writer</option>
              <option value="Lawyer">Lawyer</option>
              <option value="Doctor">Doctor</option>
              <option value="Educator">Educator</option>
            </optgroup>
            <optgroup label="Sports">
              <option value="Athlete">Athlete</option>
              <option value="Sports Analyst">Sports Analyst</option>
              <option value="Coach">Coach</option>
            </optgroup>
            <optgroup label="Other">
              <option value="Public Figure">Public Figure</option>
              <option value="Government Official">Government Official</option>
              <option value="Activist">Activist</option>
              <option value="Religious Leader">Religious Leader</option>
              <option value="Other">Other</option>
            </optgroup>
          </select>
        </div>

        {/* Location */}
        <div>
          <label style={LABEL}>Location</label>
          <input value={location} onChange={e => setLocation(e.target.value)}
            maxLength={60} placeholder="Lagos, Nigeria" style={INP} />
        </div>

        {/* Birthday */}
        <div>
          <label style={LABEL}>Date of birth</label>
          <input value={dob} onChange={e => setDob(e.target.value)}
            type="date" max={maxDob} style={INP} />
          {dob && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {(['everyone', 'followers', 'only_me'] as const).map(opt => (
                <button key={opt} onClick={() => setBirthdayVis(opt)} style={{
                  padding: '5px 13px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border: `1px solid ${birthdayVis === opt ? 'var(--color-brand)' : 'var(--color-border)'}`,
                  background: birthdayVis === opt ? 'var(--color-brand)' : 'none',
                  color: birthdayVis === opt ? 'white' : 'var(--color-text-secondary)',
                }}>
                  {opt === 'everyone' ? 'Everyone' : opt === 'followers' ? 'Followers' : 'Only me'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Website */}
        <div>
          <label style={LABEL}>Website / Link</label>
          <input value={website} onChange={e => setWebsite(e.target.value)}
            maxLength={100} type="url" inputMode="url"
            placeholder="https://yoursite.com" style={INP} />
        </div>

      </div>

      {/* Save / Cancel buttons */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 20 }}>
        <button onClick={onCancel} style={{
          padding: '7px 16px', borderRadius: 20,
          border: '1px solid var(--color-border)', background: 'none',
          color: 'var(--color-text-secondary)', fontSize: 13,
          fontFamily: "'Syne', sans-serif", fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <X size={12} /> Cancel
        </button>
        <button onClick={handleSave} disabled={isPending || !displayName.trim()} style={{
          padding: '7px 18px', borderRadius: 20,
          background: 'var(--color-brand)', border: 'none', color: 'white',
          fontSize: 13, fontFamily: "'Syne', sans-serif", fontWeight: 700,
          cursor: isPending || !displayName.trim() ? 'not-allowed' : 'pointer',
          opacity: isPending || !displayName.trim() ? 0.5 : 1,
          display: 'flex', alignItems: 'center', gap: 4,
          transition: 'opacity 0.15s',
        }}>
          {isPending
            ? <Loader size={12} style={{ animation: 'spin .7s linear infinite' }} />
            : <Check size={12} />
          }
          Save
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}