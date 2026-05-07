// src/components/profile/profile-header.tsx
'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Settings, Camera, Loader } from 'lucide-react'
import { updateAvatarAction, updateBannerAction } from '@/lib/actions/profiles'
import CropModal from './crop-modal'
import ProfileHeaderView from './profile-header-view'
import ProfileHeaderEdit from './profile-header-edit'

type UploadTarget = 'avatar' | 'banner'

interface ProfileHeaderProps {
  profile: {
    id: string
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
    occupation?: string | null
    email?: string | null
    phone_number?: string | null
    bvn_verified?: boolean
  }
  stats: { following: string; followers: string; posts: string; mutuals: string }
  isOwner: boolean
  actionSlot?: React.ReactNode
  showBirthday?: boolean
}

export default function ProfileHeader({
  profile, stats, isOwner, actionSlot, showBirthday = false,
}: ProfileHeaderProps) {
  const [editing,    setEditing]    = useState(false)
  const [avatarSrc,  setAvatarSrc]  = useState<string | null>(profile.avatar_url)
  const [bannerSrc,  setBannerSrc]  = useState<string | null>(profile.banner_url)
  const [uploading,  setUploading]  = useState<UploadTarget | null>(null)
  const [cropFile,   setCropFile]   = useState<File | null>(null)
  const [cropTarget, setCropTarget] = useState<UploadTarget | null>(null)
  const [uploadErr,  setUploadErr]  = useState('')

  const avatarRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)

  const initials = profile.display_name?.slice(0, 2).toUpperCase() || 'SP'

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
    setCropFile(null); setCropTarget(null); setUploading(target); setUploadErr('')

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
        setUploadErr(data.error ?? 'Image upload failed.')
        return
      }

      const save = target === 'avatar'
        ? await updateAvatarAction(data.media.url)
        : await updateBannerAction(data.media.url)

      if (save.error) {
        if (target === 'avatar') setAvatarSrc(profile.avatar_url)
        else setBannerSrc(profile.banner_url)
        setUploadErr(save.error)
        return
      }

      if (target === 'avatar') setAvatarSrc(data.media.url)
      else setBannerSrc(data.media.url)
    } catch {
      if (target === 'avatar') setAvatarSrc(profile.avatar_url)
      else setBannerSrc(profile.banner_url)
      setUploadErr('Upload failed. Check your connection.')
    } finally {
      setUploading(null)
    }
  }, [cropTarget, profile.avatar_url, profile.banner_url])

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Crop modal */}
      {cropFile && cropTarget && (
        <CropModal
          file={cropFile}
          aspect={cropTarget === 'avatar' ? '1:1' : '3:1'}
          onCancel={() => { setCropFile(null); setCropTarget(null) }}
          onDone={handleCropDone}
        />
      )}

      {/* ── Banner ─────────────────────────────────────────────────────────── */}
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
              : <>
                  <Camera size={18} color="white" strokeWidth={2} />
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

      {/* ── Avatar + top action row ────────────────────────────────────────── */}
      <div style={{ padding: '0 16px', position: 'relative' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-end', marginBottom: 12,
        }}>
          {/* Avatar */}
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
              <img src={avatarSrc} alt={profile.display_name}
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

          {/* Settings + Edit profile (view mode) */}
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
              <button onClick={() => setEditing(true)} style={{
                border: '1px solid var(--color-border)', borderRadius: 20, padding: '8px 16px',
                background: 'none', color: 'var(--color-text-primary)',
                fontSize: 14, fontFamily: "'Syne', sans-serif", fontWeight: 600,
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}>
                Edit profile
              </button>
            </div>
          )}

          {/* Non-owner action slot */}
          {!isOwner && actionSlot && (
            <div style={{ display: 'flex', gap: 8 }}>{actionSlot}</div>
          )}
        </div>

        {/* Upload error */}
        {uploadErr && (
          <p style={{ fontSize: 13, color: 'var(--color-error)', marginBottom: 10 }}>{uploadErr}</p>
        )}

        {/* ── View or Edit ────────────────────────────────────────────────── */}
        {!editing ? (
          <ProfileHeaderView
            profile={profile}
            stats={stats}
            isOwner={isOwner}
            showBirthday={showBirthday}
          />
        ) : (
          <ProfileHeaderEdit
            profile={profile}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        )}
      </div>
    </>
  )
}