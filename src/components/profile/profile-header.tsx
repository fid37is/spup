// src/components/profile/profile-header.tsx
'use client'

import { useState, useRef, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Settings, MapPin, Link2, Calendar, BadgeCheck,
  Camera, Loader, Check, X, Cake,
} from 'lucide-react'
import { updateProfileAction, updateAvatarAction, updateBannerAction } from '@/lib/actions/profiles'
import CropModal from './crop-modal'

interface ProfileHeaderProps {
  profile: {
    display_name: string
    username: string
    avatar_url: string | null
    banner_url: string | null
    bio: string | null
    location: string | null
    website_url: string | null
    is_monetised: boolean
    verification_tier: string
    created_at: string
    date_of_birth?: string | null
    birthday_visibility?: string | null
  }
  stats: { following: string; followers: string; posts: string; mutuals: string }
  isOwner: boolean
  actionSlot?: React.ReactNode
  /** For non-owner pages: resolved server-side based on birthday_visibility */
  showBirthday?: boolean
}

type UploadTarget = 'avatar' | 'banner'

const INP: React.CSSProperties = {
  width: '100%',
  background: 'var(--input-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  padding: '10px 13px',
  color: 'var(--color-text-primary)',
  fontSize: 15,
  outline: 'none',
  fontFamily: "'DM Sans', sans-serif",
  WebkitAppearance: 'none',
  appearance: 'none',
  boxSizing: 'border-box',
}

const FIELD_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.07em',
  textTransform: 'uppercase', color: 'var(--color-text-muted)',
  display: 'block', marginBottom: 6,
}

export default function ProfileHeader({ profile, stats, isOwner, actionSlot, showBirthday = true }: ProfileHeaderProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)

  // Editable fields
  const [displayName, setDisplayName] = useState<string>(profile.display_name ?? '')
  const [bio,         setBio]         = useState<string>(profile.bio          ?? '')
  const [location,    setLocation]    = useState<string>(profile.location     ?? '')
  const [website,     setWebsite]     = useState<string>(profile.website_url  ?? '')
  const [birthdayVis, setBirthdayVis] = useState<'everyone' | 'followers' | 'only_me'>(
    (profile.birthday_visibility as any) ?? 'followers'
  )

  // Image state
  const avatarRef    = useRef<HTMLInputElement>(null)
  const bannerRef    = useRef<HTMLInputElement>(null)
  const [avatarSrc,  setAvatarSrc]  = useState<string | null>(profile.avatar_url)
  const [bannerSrc,  setBannerSrc]  = useState<string | null>(profile.banner_url)
  const [uploading,  setUploading]  = useState<UploadTarget | null>(null)
  const [cropFile,   setCropFile]   = useState<File | null>(null)
  const [cropTarget, setCropTarget] = useState<UploadTarget | null>(null)

  // Save state
  const [isPending, startT] = useTransition()
  const [saveError, setSaveError] = useState<string>('')

  const initials    = (displayName || profile.display_name || 'SP').slice(0, 2).toUpperCase()
  const joinDate    = new Date(profile.created_at).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })
  const connectBase = `/connections/${profile.username}`
  const isBusy      = isPending || uploading !== null

  function startEdit() {
    setDisplayName(profile.display_name ?? '')
    setBio(profile.bio                  ?? '')
    setLocation(profile.location        ?? '')
    setWebsite(profile.website_url      ?? '')
    setBirthdayVis((profile.birthday_visibility as any) ?? 'followers')
    setSaveError('')
    setEditing(true)
  }

  function cancelEdit() {
    setAvatarSrc(profile.avatar_url)
    setBannerSrc(profile.banner_url)
    setSaveError('')
    setEditing(false)
  }

  function handleSave() {
    if (!displayName.trim()) { setSaveError('Display name is required.'); return }
    setSaveError('')
    startT(async () => {
      const r = await updateProfileAction({
        display_name:        displayName.trim(),
        bio:                 bio.trim()      || undefined,
        location:            location.trim() || undefined,
        website_url:         website.trim()  || undefined,
        birthday_visibility: birthdayVis,
      })
      if (r.error) { setSaveError(r.error); return }
      router.refresh()
      setEditing(false)
    })
  }

  function onFileChange(target: UploadTarget) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) { setCropTarget(target); setCropFile(file) }
      e.target.value = ''
    }
  }

  const handleCropDone = useCallback(async (blob: Blob) => {
    if (!cropTarget) return
    const target = cropTarget
    setCropFile(null); setCropTarget(null); setUploading(target)

    const preview = URL.createObjectURL(blob)
    if (target === 'avatar') setAvatarSrc(preview)
    else setBannerSrc(preview)

    try {
      const file = new File([blob], `${target}_${Date.now()}.jpg`, { type: 'image/jpeg' })
      const form = new FormData()
      form.append('file', file)
      form.append('type', target)

      const res  = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await res.json()

      if (!res.ok || !data.media?.url) {
        if (target === 'avatar') setAvatarSrc(profile.avatar_url)
        else setBannerSrc(profile.banner_url)
        setSaveError(data.error ?? 'Image upload failed.')
        return
      }

      const save = target === 'avatar'
        ? await updateAvatarAction(data.media.url)
        : await updateBannerAction(data.media.url)

      if (save.error) {
        if (target === 'avatar') setAvatarSrc(profile.avatar_url)
        else setBannerSrc(profile.banner_url)
        setSaveError(save.error)
        return
      }

      if (target === 'avatar') setAvatarSrc(data.media.url)
      else setBannerSrc(data.media.url)
    } catch {
      if (target === 'avatar') setAvatarSrc(profile.avatar_url)
      else setBannerSrc(profile.banner_url)
      setSaveError('Upload failed. Check your connection.')
    } finally {
      setUploading(null)
    }
  }, [cropTarget, profile.avatar_url, profile.banner_url])

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {cropFile && cropTarget && (
        <CropModal
          file={cropFile}
          aspect={cropTarget === 'avatar' ? '1:1' : '3:1'}
          onCancel={() => { setCropFile(null); setCropTarget(null) }}
          onDone={handleCropDone}
        />
      )}

      {/* ── Banner ────────────────────────────────────────────────────────── */}
      <div
        onClick={() => editing && !uploading && bannerRef.current?.click()}
        style={{
          height: 160, position: 'relative', overflow: 'hidden',
          background: bannerSrc
            ? 'transparent'
            : 'linear-gradient(135deg, #0A2016 0%, #1A3A20 50%, #0F2510 100%)',
          cursor: editing ? 'pointer' : 'default',
        }}
      >
        {bannerSrc && (
          <img src={bannerSrc} alt="Cover"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
        {editing && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.38)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {uploading === 'banner'
              ? <Loader size={22} color="white" style={{ animation: 'spin .8s linear infinite' }} />
              : <><Camera size={18} color="white" strokeWidth={2} />
                  <span style={{ fontSize: 13, color: 'white', fontWeight: 600, fontFamily: "'Syne', sans-serif" }}>
                    {bannerSrc ? 'Change cover photo' : 'Add cover photo'}
                  </span>
                </>
            }
          </div>
        )}
        <input ref={bannerRef} type="file" accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }} onChange={onFileChange('banner')} />
      </div>

      <div style={{ padding: '0 20px', position: 'relative' }}>

        {/* ── Avatar + action row ────────────────────────────────────────── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-end', marginBottom: editing ? 16 : 12,
        }}>
          <div
            onClick={() => editing && !uploading && avatarRef.current?.click()}
            style={{
              width: 84, height: 84, borderRadius: '50%',
              border: '4px solid var(--color-bg)',
              overflow: 'hidden', position: 'relative',
              marginTop: -42, flexShrink: 0,
              cursor: editing ? 'pointer' : 'default',
            }}
          >
            {avatarSrc ? (
              <img src={avatarSrc} alt={displayName || profile.display_name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                background: 'linear-gradient(135deg, #1A7A4A, #22A861)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 30, color: 'white',
              }}>
                {initials}
              </div>
            )}
            {editing && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {uploading === 'avatar'
                  ? <Loader size={18} color="white" style={{ animation: 'spin .8s linear infinite' }} />
                  : <Camera size={16} color="white" strokeWidth={2} />
                }
              </div>
            )}
            {!editing && profile.verification_tier !== 'none' && (
              <div style={{
                position: 'absolute', bottom: 2, right: 2,
                width: 20, height: 20, borderRadius: '50%',
                background: 'var(--color-brand)', border: '2px solid var(--color-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, color: 'white',
              }}>✓</div>
            )}
            <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: 'none' }} onChange={onFileChange('avatar')} />
          </div>

          {/* Action buttons */}
          {isOwner && !editing && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Link href="/settings" aria-label="Settings" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 38, height: 38, borderRadius: '50%',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)', textDecoration: 'none',
              }}>
                <Settings size={16} />
              </Link>
              <button onClick={startEdit} style={{
                border: '1px solid var(--color-border)', borderRadius: 20, padding: '8px 16px',
                background: 'none', color: 'var(--color-text-primary)',
                fontSize: 14, fontFamily: "'Syne', sans-serif", fontWeight: 600,
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}>
                Edit profile
              </button>
            </div>
          )}

          {isOwner && editing && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={cancelEdit} disabled={isBusy} style={{
                border: '1px solid var(--color-border)', borderRadius: 20, padding: '8px 14px',
                background: 'none', color: 'var(--color-text-secondary)',
                fontSize: 14, fontFamily: "'Syne', sans-serif", fontWeight: 600,
                cursor: isBusy ? 'not-allowed' : 'pointer', opacity: isBusy ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: 5,
                WebkitTapHighlightColor: 'transparent',
              }}>
                <X size={14} /> Cancel
              </button>
              <button onClick={handleSave} disabled={isBusy || !displayName.trim()} style={{
                background: 'var(--color-brand)', color: 'white',
                border: 'none', borderRadius: 20, padding: '8px 16px',
                fontSize: 14, fontFamily: "'Syne', sans-serif", fontWeight: 700,
                cursor: isBusy || !displayName.trim() ? 'not-allowed' : 'pointer',
                opacity: isBusy || !displayName.trim() ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: 5,
                transition: 'opacity 0.15s',
                WebkitTapHighlightColor: 'transparent',
              }}>
                {isPending
                  ? <Loader size={14} style={{ animation: 'spin .7s linear infinite' }} />
                  : <Check size={14} />
                }
                Save
              </button>
            </div>
          )}

          {!isOwner && actionSlot && (
            <div style={{ display: 'flex', gap: 8 }}>{actionSlot}</div>
          )}
        </div>

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

        {/* ── VIEW mode ─────────────────────────────────────────────────────── */}
        {!editing && (
          <>
            <h1 style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22,
              color: 'var(--color-text-primary)', letterSpacing: '-0.01em', marginBottom: 2,
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              {profile.display_name}
              {profile.verification_tier !== 'none' && (
                <BadgeCheck size={18} color="var(--color-brand)" style={{ flexShrink: 0 }} />
              )}
              {profile.is_monetised && (
                <span style={{
                  fontSize: 11, background: 'var(--color-gold)', color: '#000',
                  padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                }}>PRO</span>
              )}
            </h1>
            <p style={{ fontSize: 15, color: 'var(--color-text-muted)', marginBottom: 10 }}>
              @{profile.username}
            </p>
            {profile.bio && (
              <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', lineHeight: 1.65, marginBottom: 12 }}>
                {profile.bio}
              </p>
            )}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
              {profile.location && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: 'var(--color-text-muted)' }}>
                  <MapPin size={14} strokeWidth={1.8} />{profile.location}
                </span>
              )}
              {profile.website_url && (
                <a href={profile.website_url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: 'var(--color-brand)', textDecoration: 'none' }}>
                  <Link2 size={14} strokeWidth={1.8} />
                  {profile.website_url.replace(/^https?:\/\//, '')}
                </a>
              )}
              {/* Birthday — shown to owner always; to others based on visibility */}
              {(isOwner || showBirthday) && profile.date_of_birth && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: 'var(--color-text-muted)' }}>
                  <Cake size={14} strokeWidth={1.8} />
                  Born {new Date(profile.date_of_birth).toLocaleDateString('en-NG', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: 'var(--color-text-muted)' }}>
                <Calendar size={14} strokeWidth={1.8} />Joined {joinDate}
              </span>
            </div>
          </>
        )}

        {/* ── EDIT mode ─────────────────────────────────────────────────────── */}
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>

            <div>
              <label style={FIELD_LABEL}>
                Display name <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                maxLength={50}
                placeholder="Your name"
                style={INP}
              />
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                {50 - displayName.length} left
              </p>
            </div>

            <div>
              <label style={FIELD_LABEL}>Bio</label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                maxLength={160}
                rows={3}
                placeholder="Tell people about yourself"
                style={{ ...INP, resize: 'none', lineHeight: 1.55 }}
              />
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                {160 - bio.length} left
              </p>
            </div>

            <div>
              <label style={FIELD_LABEL}>Location</label>
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                maxLength={60}
                placeholder="Lagos, Nigeria"
                style={INP}
              />
            </div>

            <div>
              <label style={FIELD_LABEL}>Website</label>
              <input
                value={website}
                onChange={e => setWebsite(e.target.value)}
                maxLength={100}
                type="url"
                inputMode="url"
                placeholder="https://yoursite.com"
                style={INP}
              />
            </div>

            {/* Birthday — date is fixed, only visibility is editable */}
            {profile.date_of_birth && (
              <div>
                <label style={FIELD_LABEL}>Birthday</label>

                {/* Read-only date */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 13px', marginBottom: 10,
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Cake size={14} color="var(--color-text-muted)" strokeWidth={1.8} />
                    <span style={{ fontSize: 15, color: 'var(--color-text-secondary)' }}>
                      {new Date(profile.date_of_birth).toLocaleDateString('en-NG', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })}
                    </span>
                  </span>
                  <span style={{
                    fontSize: 11, color: 'var(--color-text-faint)',
                    background: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 5, padding: '2px 7px', flexShrink: 0,
                  }}>
                    Read-only
                  </span>
                </div>

                {/* Visibility picker */}
                <p style={{ ...FIELD_LABEL, marginBottom: 8 }}>Who can see your birthday</p>
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
                  {(['everyone', 'followers', 'only_me'] as const).map((opt, i, arr) => {
                    const LABELS = { everyone: 'Everyone', followers: 'Followers only', only_me: 'Only me' }
                    const active = birthdayVis === opt
                    return (
                      <div
                        key={opt}
                        onClick={() => setBirthdayVis(opt)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '11px 13px',
                          borderBottom: i < arr.length - 1 ? '1px solid var(--color-border)' : 'none',
                          cursor: 'pointer',
                          background: active ? 'rgba(26,154,95,0.06)' : 'transparent',
                          transition: 'background 0.1s',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        {/* Radio */}
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                          border: `2px solid ${active ? 'var(--color-brand)' : 'var(--color-border)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'border-color 0.15s',
                        }}>
                          {active && (
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-brand)' }} />
                          )}
                        </div>
                        <span style={{
                          fontSize: 14,
                          color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                          fontWeight: active ? 600 : 400,
                        }}>
                          {LABELS[opt]}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── Stats row ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 4 }}>
          {[
            { value: stats.following, label: 'Following', tab: 'following' },
            { value: stats.followers, label: 'Followers', tab: 'followers' },
            { value: stats.mutuals,   label: 'Mutuals',   tab: 'mutuals'   },
          ].map(({ value, label, tab }) => (
            <Link
              key={tab}
              href={`${connectBase}?tab=${tab}`}
              style={{ display: 'flex', alignItems: 'baseline', gap: 4, textDecoration: 'none' }}
            >
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--color-text-primary)' }}>
                {value}
              </span>
              <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
                {label}
              </span>
            </Link>
          ))}
        </div>

      </div>
    </>
  )
}