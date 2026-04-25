// src/app/(auth)/onboarding/page.tsx
'use client'

import { useState, useRef, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  saveUsernameAction, checkUsernameAvailableAction,
  saveAvatarAction, saveBioAction,
  saveInterestsAction, completeOnboardingAction,
} from '@/lib/actions'
import { Alert } from '@/components/auth/form-field'
import { NIGERIAN_INTERESTS } from '@/types'
import { Check, CheckCircle, Upload, Loader, XCircle, ChevronLeft } from 'lucide-react'

const STEPS = ['Username', 'Photo', 'Bio', 'Interests', 'Follow']

const SUGGESTED = [
  { username: 'tinuade_tech', name: 'Tinuade Adewale', bio: 'Lagos tech founder & startup news',             avatar: 'TA', color: '#1A9E5F', followers: '12.4K' },
  { username: 'naija_comedy', name: 'Comedy Spup',     bio: 'Best Naija comedy skits daily 😂',              avatar: 'NC', color: '#7A3A1A', followers: '89K'   },
  { username: 'abuja_foodie', name: 'Abuja Foodie',    bio: 'Finding the best buka and restaurants',         avatar: 'AF', color: '#1A4A7A', followers: '23K'   },
  { username: 'spup_sports',  name: 'Spup Sports',     bio: 'Super Eagles, NPFL, EPL — all things football', avatar: 'SS', color: '#4A1A7A', followers: '156K'  },
  { username: 'naira_news',   name: 'Naira & Economy', bio: 'CBN, forex, markets — your money news',        avatar: 'NN', color: '#7A6A1A', followers: '44K'   },
]

const BASE: React.CSSProperties = {
  width: '100%', background: '#131318', border: '1px solid #1E1E26',
  borderRadius: 10, padding: '11px 14px', color: '#F0F0EC',
  fontSize: 15, outline: 'none', fontFamily: "'DM Sans', sans-serif",
}
const LBL: React.CSSProperties = {
  fontSize: 12, color: '#8A8A85', display: 'block', marginBottom: 6, fontWeight: 500,
}
const BTN: React.CSSProperties = {
  width: '100%', background: '#1A9E5F', color: 'white', border: 'none',
  borderRadius: 10, padding: '13px', fontFamily: "'Syne', sans-serif",
  fontWeight: 700, fontSize: 15, cursor: 'pointer', letterSpacing: '0.01em',
  transition: 'opacity 0.15s',
}
const SKIP_BTN: React.CSSProperties = {
  width: '100%', background: 'none', border: 'none',
  fontSize: 13, color: '#44444A', cursor: 'pointer',
  fontFamily: "'DM Sans', sans-serif", padding: '8px 0',
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  // Track the highest step reached so we know what's "unlocked" for back nav
  const [maxStep, setMaxStep] = useState(0)
  const [error, setError] = useState('')

  // One transition per step — no bleed
  const [pendingUsername,  startUsername]  = useTransition()
  const [pendingAvatar,    startAvatar]    = useTransition()
  const [pendingBio,       startBio]       = useTransition()
  const [pendingInterests, startInterests] = useTransition()
  const [pendingFinish,    startFinish]    = useTransition()

  const anyPending = pendingUsername || pendingAvatar || pendingBio || pendingInterests || pendingFinish

  // Step 0 — username
  const [username, setUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle')
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Step 1 — avatar
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Step 2 — bio
  const [bio, setBio] = useState('')

  // Step 3 — interests
  const [interests, setInterests] = useState<string[]>([])

  // Step 4 — follow
  const [followed, setFollowed] = useState<Set<string>>(new Set())

  // ── Navigation helpers ───────────────────────────────────────────────────────
  function goToStep(target: number) {
    // Only allow going to completed steps or current step
    if (target < 0 || target > maxStep || anyPending) return
    setError('')
    setStep(target)
  }

  function advanceTo(next: number) {
    setStep(next)
    setMaxStep(prev => Math.max(prev, next))
    setError('')
  }

  // ── Username ─────────────────────────────────────────────────────────────────
  const checkUsername = useCallback((val: string) => {
    if (checkTimer.current) clearTimeout(checkTimer.current)
    if (!val || val.length < 3 || !/^[a-zA-Z0-9_]+$/.test(val)) {
      setUsernameStatus('idle'); return
    }
    setUsernameStatus('checking')
    checkTimer.current = setTimeout(async () => {
      const { available } = await checkUsernameAvailableAction(val)
      setUsernameStatus(available ? 'ok' : 'taken')
    }, 500)
  }, [])

  function handleUsernameChange(val: string) {
    const clean = val.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)
    setUsername(clean)
    setError('')
    checkUsername(clean)
  }

  function submitUsername() {
    setError('')
    startUsername(async () => {
      const r = await saveUsernameAction(username)
      if (r.error) { setError(r.error); return }
      advanceTo(1)
    })
  }

  // ── Avatar ───────────────────────────────────────────────────────────────────
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    setAvatarPreview(URL.createObjectURL(file))
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('type', 'avatar')
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok || !data.media?.url) {
        setUploadError(data.error || 'Upload failed. Please try again.')
        setAvatarPreview(null)
      } else {
        setAvatarUrl(data.media.url)
      }
    } catch {
      setUploadError('Upload failed. Check your connection and try again.')
      setAvatarPreview(null)
    } finally {
      setUploading(false)
    }
  }

  function submitAvatar() {
    setError('')
    if (!avatarUrl) {
      advanceTo(2)
      return
    }
    startAvatar(async () => {
      const r = await saveAvatarAction(avatarUrl)
      if (r.error) { setError(r.error); return }
      advanceTo(2)
    })
  }

  // ── Bio ──────────────────────────────────────────────────────────────────────
  function submitBio() {
    setError('')
    startBio(async () => {
      const r = await saveBioAction(bio)
      if (r.error) { setError(r.error); return }
      advanceTo(3)
    })
  }

  function skipBio() {
    setError('')
    startBio(async () => {
      await saveBioAction('')
      advanceTo(3)
    })
  }

  // ── Interests ────────────────────────────────────────────────────────────────
  function toggleInterest(id: string) {
    setInterests(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : prev.length < 10 ? [...prev, id] : prev
    )
    setError('')
  }

  function submitInterests() {
    if (interests.length < 3) { setError('Pick at least 3 interests'); return }
    setError('')
    startInterests(async () => {
      const r = await saveInterestsAction({ interests })
      if (r.error) { setError(r.error); return }
      advanceTo(4)
    })
  }

  // ── Finish ───────────────────────────────────────────────────────────────────
  function toggleFollow(uname: string) {
    setFollowed(prev => {
      const next = new Set(prev)
      next.has(uname) ? next.delete(uname) : next.add(uname)
      return next
    })
  }

  function finish() {
    setError('')
    startFinish(async () => {
      const r = await completeOnboardingAction()
      if (r?.error) { setError(r.error); return }
      router.refresh()
      router.push('/feed')
    })
  }

  const pct = Math.round((step / (STEPS.length - 1)) * 100)

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* ── Progress bar ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          {STEPS.map((s, i) => {
            const isCompleted = i < step
            const isCurrent   = i === step
            const isReachable = i < step && !anyPending  // can click back

            return (
              <div
                key={i}
                onClick={() => isReachable ? goToStep(i) : undefined}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  cursor: isReachable ? 'pointer' : 'default',
                  opacity: i > maxStep ? 0.4 : 1,
                  transition: 'opacity 0.2s',
                }}
                title={isReachable ? `Go back to ${s}` : undefined}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: isCompleted ? '#1A9E5F' : isCurrent ? '#1A9E5F' : '#1E1E26',
                  border: `2px solid ${i <= step ? '#1A9E5F' : '#2A2A2A'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.3s',
                  // Subtle hover ring on clickable completed steps
                  boxShadow: isReachable ? '0 0 0 2px rgba(26,158,95,0.25)' : 'none',
                }}>
                  {isCompleted
                    ? <Check size={13} color="white" />
                    : <span style={{ fontSize: 11, fontWeight: 700, color: isCurrent ? 'white' : '#444', fontFamily: "'Syne', sans-serif" }}>{i + 1}</span>
                  }
                </div>
                <span style={{
                  fontSize: 10, fontWeight: isCurrent ? 700 : 400,
                  color: isCurrent ? '#F0F0EC' : isCompleted ? '#6A9E8A' : '#44444A',
                  textDecoration: isReachable ? 'underline' : 'none',
                  textUnderlineOffset: 2,
                }}>
                  {s}
                </span>
              </div>
            )
          })}
        </div>
        <div style={{ height: 3, background: '#1E1E26', borderRadius: 2 }}>
          <div style={{ height: '100%', background: '#1A9E5F', borderRadius: 2, width: `${pct}%`, transition: 'width 0.4s ease' }} />
        </div>
      </div>

      {error && <Alert type="error" message={error} />}

      {/* ── Step 0: Username ── */}
      {step === 0 && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em', marginBottom: 6 }}>
              Choose your username
            </h2>
            <p style={{ fontSize: 14, color: '#6A6A60' }}>This is how people find and mention you</p>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={LBL}>Username</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#44444A', fontSize: 15 }}>@</span>
              <input
                value={username}
                onChange={e => handleUsernameChange(e.target.value)}
                placeholder="yourhandle"
                maxLength={20}
                autoFocus
                style={{
                  ...BASE, paddingLeft: 30, paddingRight: 40,
                  borderColor: usernameStatus === 'taken' ? '#E53935' : usernameStatus === 'ok' ? '#1A9E5F' : '#1E1E26',
                }}
              />
              <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}>
                {usernameStatus === 'checking' && <Loader size={16} color="#44444A" style={{ animation: 'spin 0.8s linear infinite' }} />}
                {usernameStatus === 'ok'       && <CheckCircle size={16} color="#1A9E5F" />}
                {usernameStatus === 'taken'    && <XCircle size={16} color="#E53935" />}
              </div>
            </div>
            <div style={{ marginTop: 6, fontSize: 12 }}>
              {usernameStatus === 'taken' && <span style={{ color: '#E53935' }}>That username is taken. Try another.</span>}
              {usernameStatus === 'ok'    && <span style={{ color: '#1A9E5F' }}>✓ Available</span>}
              {usernameStatus === 'idle'  && <span style={{ color: '#44444A' }}>3–20 characters. Letters, numbers, underscores only.</span>}
            </div>
          </div>
          <button
            onClick={submitUsername}
            disabled={pendingUsername || username.length < 3 || usernameStatus === 'taken' || usernameStatus === 'checking'}
            style={{ ...BTN, opacity: (pendingUsername || username.length < 3 || usernameStatus === 'taken' || usernameStatus === 'checking') ? 0.45 : 1 }}
          >
            {pendingUsername ? 'Saving…' : 'Continue'}
          </button>
        </div>
      )}

      {/* ── Step 1: Avatar ── */}
      {step === 1 && (
        <div>
          <button onClick={() => goToStep(0)} disabled={anyPending} style={{ ...SKIP_BTN, width: 'auto', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, color: '#6A6A60' }}>
            <ChevronLeft size={15} /> Back
          </button>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em', marginBottom: 6 }}>
              Add a profile photo
            </h2>
            <p style={{ fontSize: 14, color: '#6A6A60' }}>Help people recognise you (optional)</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div
              onClick={() => !uploading && fileRef.current?.click()}
              style={{
                width: 120, height: 120, borderRadius: '50%',
                cursor: uploading ? 'not-allowed' : 'pointer',
                background: avatarPreview ? 'transparent' : 'linear-gradient(135deg, #1A9E5F, #D4A017)',
                border: '3px solid #1E1E26', position: 'relative', overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {avatarPreview
                ? <img src={avatarPreview} alt="Avatar preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : uploading
                  ? <Loader size={32} color="white" style={{ animation: 'spin 0.8s linear infinite' }} />
                  : <div style={{ textAlign: 'center' }}>
                      <Upload size={28} color="white" />
                      <div style={{ fontSize: 11, color: 'white', marginTop: 4 }}>Upload</div>
                    </div>
              }
              {uploading && avatarPreview && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Loader size={28} color="white" style={{ animation: 'spin 0.8s linear infinite' }} />
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileSelect} style={{ display: 'none' }} />
          </div>
          {uploadError && <p style={{ textAlign: 'center', fontSize: 13, color: '#E57373', marginBottom: 12 }}>{uploadError}</p>}
          {avatarUrl && !uploading && <p style={{ textAlign: 'center', fontSize: 13, color: '#1A9E5F', marginBottom: 12 }}>✓ Photo uploaded</p>}
          <button
            onClick={submitAvatar}
            disabled={pendingAvatar || uploading}
            style={{ ...BTN, opacity: (pendingAvatar || uploading) ? 0.6 : 1, marginBottom: 12 }}
          >
            {uploading ? 'Uploading…' : pendingAvatar ? 'Saving…' : 'Continue'}
          </button>
          {!avatarUrl && (
            <button onClick={() => advanceTo(2)} disabled={uploading} style={{ ...SKIP_BTN, opacity: uploading ? 0.4 : 1 }}>
              Skip for now
            </button>
          )}
        </div>
      )}

      {/* ── Step 2: Bio ── */}
      {step === 2 && (
        <div>
          <button onClick={() => goToStep(1)} disabled={anyPending} style={{ ...SKIP_BTN, width: 'auto', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, color: '#6A6A60' }}>
            <ChevronLeft size={15} /> Back
          </button>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em', marginBottom: 6 }}>
              Tell your story
            </h2>
            <p style={{ fontSize: 14, color: '#6A6A60' }}>A short bio helps people know what you&apos;re about (optional)</p>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={LBL}>Bio</label>
              <span style={{ fontSize: 11, color: bio.length > 140 ? '#E53935' : '#44444A' }}>{bio.length}/160</span>
            </div>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value.slice(0, 160))}
              placeholder="Nigerian creator, football lover, tech enthusiast…"
              rows={4}
              style={{ ...BASE, resize: 'none' }}
            />
          </div>
          <button onClick={submitBio} disabled={pendingBio} style={{ ...BTN, opacity: pendingBio ? 0.6 : 1, marginBottom: 12 }}>
            {pendingBio ? 'Saving…' : 'Continue'}
          </button>
          <button onClick={skipBio} disabled={pendingBio} style={{ ...SKIP_BTN, opacity: pendingBio ? 0.5 : 1 }}>
            Skip for now
          </button>
        </div>
      )}

      {/* ── Step 3: Interests ── */}
      {step === 3 && (
        <div>
          <button onClick={() => goToStep(2)} disabled={anyPending} style={{ ...SKIP_BTN, width: 'auto', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, color: '#6A6A60' }}>
            <ChevronLeft size={15} /> Back
          </button>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em', marginBottom: 6 }}>
              What are you into?
            </h2>
            <p style={{ fontSize: 14, color: '#6A6A60' }}>
              Pick at least 3 — we&apos;ll personalise your feed
              <br />
              <span style={{ color: interests.length >= 3 ? '#1A9E5F' : '#44444A' }}>{interests.length}/10 selected</span>
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            {NIGERIAN_INTERESTS.map(interest => {
              const sel = interests.includes(interest.id)
              return (
                <button
                  key={interest.id}
                  onClick={() => toggleInterest(interest.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 100,
                    border: `1.5px solid ${sel ? '#1A9E5F' : '#1E1E26'}`,
                    background: sel ? 'rgba(26,158,95,0.12)' : '#131318',
                    color: sel ? '#1A9E5F' : '#8A8A85',
                    fontSize: 13, fontWeight: sel ? 600 : 400,
                    cursor: 'pointer', transition: 'all 0.15s',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  <span>{interest.emoji}</span>
                  {interest.label}
                  {sel && <Check size={11} />}
                </button>
              )
            })}
          </div>
          <button
            onClick={submitInterests}
            disabled={pendingInterests || interests.length < 3}
            style={{ ...BTN, opacity: (pendingInterests || interests.length < 3) ? 0.45 : 1 }}
          >
            {pendingInterests ? 'Saving…' : `Continue with ${interests.length} interest${interests.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* ── Step 4: Follow ── */}
      {step === 4 && (
        <div>
          <button onClick={() => goToStep(3)} disabled={anyPending} style={{ ...SKIP_BTN, width: 'auto', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, color: '#6A6A60' }}>
            <ChevronLeft size={15} /> Back
          </button>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em', marginBottom: 6 }}>
              Follow some accounts
            </h2>
            <p style={{ fontSize: 14, color: '#6A6A60' }}>Start with popular Nigerian voices on Spup</p>
          </div>
          <div style={{ marginBottom: 24 }}>
            {SUGGESTED.map(acc => (
              <div key={acc.username} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid #1A1A20' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', background: acc.color, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: 'white',
                }}>
                  {acc.avatar}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#F0F0EC', fontFamily: "'Syne', sans-serif" }}>{acc.name}</div>
                  <div style={{ fontSize: 12, color: '#44444A' }}>@{acc.username} · {acc.followers} followers</div>
                  <div style={{ fontSize: 12, color: '#6A6A60', marginTop: 2 }}>{acc.bio}</div>
                </div>
                <button
                  onClick={() => toggleFollow(acc.username)}
                  style={{
                    padding: '7px 16px', borderRadius: 20, flexShrink: 0,
                    border: `1.5px solid ${followed.has(acc.username) ? '#2A2A2A' : '#1A9E5F'}`,
                    background: followed.has(acc.username) ? 'transparent' : '#1A9E5F',
                    color: followed.has(acc.username) ? '#6A6A60' : 'white',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    fontFamily: "'Syne', sans-serif", transition: 'all 0.15s',
                  }}
                >
                  {followed.has(acc.username) ? 'Following' : 'Follow'}
                </button>
              </div>
            ))}
          </div>
          <button onClick={finish} disabled={pendingFinish} style={{ ...BTN, marginBottom: 12, opacity: pendingFinish ? 0.6 : 1 }}>
            {pendingFinish ? 'Setting up your feed…' : 'Go to Spup →'}
          </button>
          <button onClick={finish} disabled={pendingFinish} style={{ ...SKIP_BTN, opacity: pendingFinish ? 0.5 : 1 }}>
            Skip for now
          </button>
        </div>
      )}
    </div>
  )
}