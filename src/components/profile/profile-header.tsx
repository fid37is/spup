// src/components/profile/profile-header.tsx
'use client'

import { useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader, Settings } from 'lucide-react'
import Link from 'next/link'
import { updateAvatarAction, updateBannerAction } from '@/lib/actions/profiles'
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
  }
  stats: {
    following: string
    followers: string
    posts: string
  }
  isOwner: boolean
}

type UploadTarget = 'avatar' | 'banner'

export default function ProfileHeader({ profile, stats, isOwner }: ProfileHeaderProps) {
  const router     = useRouter()
  const avatarRef  = useRef<HTMLInputElement>(null)
  const bannerRef  = useRef<HTMLInputElement>(null)

  const [avatarSrc,    setAvatarSrc]    = useState<string | null>(profile.avatar_url)
  const [bannerSrc,    setBannerSrc]    = useState<string | null>(profile.banner_url)
  const [uploading,    setUploading]    = useState<UploadTarget | null>(null)
  const [uploadError,  setUploadError]  = useState('')
  const [bannerHover,  setBannerHover]  = useState(false)
  const [avatarHover,  setAvatarHover]  = useState(false)

  // Crop modal state
  const [cropFile,   setCropFile]   = useState<File | null>(null)
  const [cropTarget, setCropTarget] = useState<UploadTarget | null>(null)

  const initials = profile.display_name?.slice(0, 2).toUpperCase() || 'SP'
  const joinDate  = new Date(profile.created_at).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })

  // ── File selected → open crop modal ────────────────────────────────────────
  function onFileChange(target: UploadTarget) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        setCropTarget(target)
        setCropFile(file)
      }
      e.target.value = ''
    }
  }

  // ── Crop done → upload the resulting blob ───────────────────────────────────
  const handleCropDone = useCallback(async (blob: Blob) => {
    if (!cropTarget) return
    const target = cropTarget

    // Close modal immediately
    setCropFile(null)
    setCropTarget(null)
    setUploadError('')
    setUploading(target)

    // Optimistic preview from the cropped blob
    const preview = URL.createObjectURL(blob)
    if (target === 'avatar') setAvatarSrc(preview)
    else setBannerSrc(preview)

    try {
      const ext  = 'jpg'
      const name = `${target}_${Date.now()}.${ext}`
      const file = new File([blob], name, { type: 'image/jpeg' })

      const form = new FormData()
      form.append('file', file)
      form.append('type', target)

      const res  = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await res.json()

      if (!res.ok || !data.media?.url) {
        if (target === 'avatar') setAvatarSrc(profile.avatar_url)
        else setBannerSrc(profile.banner_url)
        setUploadError(data.error || 'Upload failed. Please try again.')
        return
      }

      const saveResult = target === 'avatar'
        ? await updateAvatarAction(data.media.url)
        : await updateBannerAction(data.media.url)

      if (saveResult.error) {
        if (target === 'avatar') setAvatarSrc(profile.avatar_url)
        else setBannerSrc(profile.banner_url)
        setUploadError(saveResult.error)
        return
      }

      // Swap blob preview for real CDN URL
      if (target === 'avatar') setAvatarSrc(data.media.url)
      else setBannerSrc(data.media.url)

      router.refresh()
    } catch {
      if (target === 'avatar') setAvatarSrc(profile.avatar_url)
      else setBannerSrc(profile.banner_url)
      setUploadError('Upload failed. Check your connection.')
    } finally {
      setUploading(null)
    }
  }, [cropTarget, profile.avatar_url, profile.banner_url, router])

  function handleCropCancel() {
    setCropFile(null)
    setCropTarget(null)
  }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* ── Crop modal ───────────────────────────────────────────────────────── */}
      {cropFile && cropTarget && (
        <CropModal
          file={cropFile}
          aspect={cropTarget === 'avatar' ? '1:1' : '3:1'}
          onCancel={handleCropCancel}
          onDone={handleCropDone}
        />
      )}

      {/* ── Banner ───────────────────────────────────────────────────────────── */}
      <div
        onClick={() => isOwner && !uploading && !cropFile && bannerRef.current?.click()}
        onMouseEnter={() => isOwner && setBannerHover(true)}
        onMouseLeave={() => setBannerHover(false)}
        style={{
          height: 160, position: 'relative', overflow: 'hidden',
          background: bannerSrc
            ? 'transparent'
            : 'linear-gradient(135deg, #0A2016 0%, #1A3A20 50%, #0F2510 100%)',
          cursor: isOwner ? 'pointer' : 'default',
        }}
      >
        {bannerSrc && (
          <img
            src={bannerSrc}
            alt="Cover photo"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}

        {isOwner && (bannerHover || uploading === 'banner') && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {uploading === 'banner'
              ? <Loader size={26} color="white" style={{ animation: 'spin 0.8s linear infinite' }} />
              : <>
                  <Camera size={20} color="white" />
                  <span style={{ fontSize: 13, color: 'white', fontWeight: 600, fontFamily: "'Syne', sans-serif" }}>
                    {bannerSrc ? 'Change cover photo' : 'Add cover photo'}
                  </span>
                </>
            }
          </div>
        )}

        <input
          ref={bannerRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={onFileChange('banner')}
        />
      </div>

      <div style={{ padding: '0 20px', position: 'relative' }}>

        {/* ── Avatar + Edit row ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>

          <div
            onClick={() => isOwner && !uploading && !cropFile && avatarRef.current?.click()}
            onMouseEnter={() => isOwner && setAvatarHover(true)}
            onMouseLeave={() => setAvatarHover(false)}
            style={{
              width: 84, height: 84, borderRadius: '50%',
              border: '4px solid var(--bg, #050508)',
              overflow: 'hidden', position: 'relative',
              cursor: isOwner ? 'pointer' : 'default',
              marginTop: -42, flexShrink: 0,
            }}
          >
            {avatarSrc
              ? <img src={avatarSrc} alt={profile.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (
                <div style={{
                  width: '100%', height: '100%',
                  background: 'linear-gradient(135deg, #1A7A4A, #22A861)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 30, color: 'white',
                }}>
                  {initials}
                </div>
              )
            }

            {isOwner && (avatarHover || uploading === 'avatar') && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '50%',
              }}>
                {uploading === 'avatar'
                  ? <Loader size={20} color="white" style={{ animation: 'spin 0.8s linear infinite' }} />
                  : <Camera size={18} color="white" />
                }
              </div>
            )}

            <input
              ref={avatarRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={onFileChange('avatar')}
            />
          </div>

          {isOwner && (
            <Link href="/settings" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              border: '1px solid var(--border, #1E1E26)',
              borderRadius: 20, padding: '8px 16px',
              textDecoration: 'none',
              color: 'var(--text-primary, #F0F0EC)',
              fontSize: 14, fontFamily: "'Syne', sans-serif", fontWeight: 600,
            }}>
              <Settings size={14} /> Edit profile
            </Link>
          )}
        </div>

        {/* Verification badge */}
        {profile.verification_tier !== 'none' && (
          <div style={{
            position: 'absolute', top: -10, left: 74,
            width: 22, height: 22, borderRadius: '50%',
            background: '#1A7A4A', border: '2px solid var(--bg, #050508)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, color: 'white', zIndex: 2,
          }}>✓</div>
        )}

        {uploadError && (
          <div style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(229,57,53,0.08)', border: '1px solid rgba(229,57,53,0.2)',
            fontSize: 13, color: '#E57373',
          }}>
            {uploadError}
          </div>
        )}

        {/* ── Name / bio ───────────────────────────────────────────────────── */}
        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22,
          color: 'var(--text-primary, #F0F0EC)', letterSpacing: '-0.01em', marginBottom: 2,
        }}>
          {profile.display_name}
          {profile.is_monetised && (
            <span style={{ marginLeft: 8, fontSize: 11, background: '#D4A017', color: '#000', padding: '2px 7px', borderRadius: 4, fontWeight: 700, verticalAlign: 'middle' }}>
              PRO
            </span>
          )}
        </h1>

        <p style={{ fontSize: 15, color: 'var(--text-muted, #44444A)', marginBottom: 10 }}>
          @{profile.username}
        </p>

        {profile.bio && (
          <p style={{ fontSize: 15, color: 'var(--text-secondary, #8A8A85)', lineHeight: 1.65, marginBottom: 12 }}>
            {profile.bio}
          </p>
        )}

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
          {profile.location && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: 'var(--text-muted, #44444A)' }}>
              📍 {profile.location}
            </span>
          )}
          {profile.website_url && (
            <a
              href={profile.website_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: 'var(--spup-green, #1A9E5F)', textDecoration: 'none' }}
            >
              🔗 {profile.website_url.replace(/^https?:\/\//, '')}
            </a>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: 'var(--text-muted, #44444A)' }}>
            📅 Joined {joinDate}
          </span>
        </div>

        {/* ── Stats ────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 4 }}>
          {[
            { value: stats.following, label: 'Following' },
            { value: stats.followers, label: 'Followers' },
            { value: stats.posts,     label: 'Posts' },
          ].map(({ value, label }) => (
            <div key={label} style={{ cursor: 'pointer' }}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--text-primary, #F0F0EC)' }}>
                {value}
              </span>
              {' '}
              <span style={{ fontSize: 14, color: 'var(--text-muted, #44444A)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}