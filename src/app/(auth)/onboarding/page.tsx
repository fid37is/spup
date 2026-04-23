'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { profileSetupSchema, type ProfileSetupSchema } from '@/lib/validations/schemas'
import { saveProfileAction, saveInterestsAction, completeOnboardingAction } from '@/lib/actions'
import { FormField, Alert, SubmitButton } from '@/components/auth/form-field'
import { NIGERIAN_INTERESTS } from '@/types'
import { Check, ChevronRight } from 'lucide-react'

const STEPS = ['Profile', 'Interests', 'Follow']

const SUGGESTED_ACCOUNTS = [
  { username: 'tinuade_tech', name: 'Tinuade Adewale', bio: 'Lagos tech founder & startup news', avatar: 'TA', color: '#1A7A4A', followers: '12.4K' },
  { username: 'naija_comedy', name: 'Comedy Spup', bio: 'Best Naija comedy skits daily 😂', avatar: 'NC', color: '#7A3A1A', followers: '89K' },
  { username: 'abuja_foodie', name: 'Abuja Foodie', bio: 'Finding the best buka and restaurants', avatar: 'AF', color: '#1A4A7A', followers: '23K' },
  { username: 'para_sports', name: 'Spup Sports', bio: 'Super Eagles, NPFL, EPL — all things football', avatar: 'PS', color: '#4A1A7A', followers: '156K' },
  { username: 'naira_news', name: 'Naira & Economy', bio: 'CBN, forex, markets — your money news', avatar: 'NN', color: '#7A6A1A', followers: '44K' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [followed, setFollowed] = useState<Set<string>>(new Set())

  const { register, handleSubmit, formState: { errors } } = useForm<ProfileSetupSchema>({
    resolver: zodResolver(profileSetupSchema),
  })

  async function handleProfileSubmit(data: ProfileSetupSchema) {
    setError('')
    setLoading(true)
    const result = await saveProfileAction(data)
    setLoading(false)
    if (result.error) setError(result.error)
    else setStep(1)
  }

  async function handleInterestsContinue() {
    if (selectedInterests.length < 3) {
      setError('Please select at least 3 interests')
      return
    }
    setError('')
    setLoading(true)
    const result = await saveInterestsAction({ interests: selectedInterests })
    setLoading(false)
    if (result.error) setError(result.error)
    else setStep(2)
  }

  async function handleComplete() {
    setLoading(true)
    await completeOnboardingAction()
    router.push('/feed')
    router.refresh()
  }

  function toggleInterest(id: string) {
    setSelectedInterests(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : prev.length < 10 ? [...prev, id] : prev
    )
    setError('')
  }

  function toggleFollow(username: string) {
    setFollowed(prev => {
      const next = new Set(prev)
      next.has(username) ? next.delete(username) : next.add(username)
      return next
    })
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* Progress */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: i < step ? '#1A7A4A' : i === step ? '#22A861' : '#1E1E1E',
                border: `2px solid ${i <= step ? '#1A7A4A' : '#2A2A2A'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.3s',
              }}>
                {i < step
                  ? <Check size={12} color="white" />
                  : <span style={{ fontSize: 11, fontWeight: 700, color: i === step ? 'white' : '#444', fontFamily: "'Syne', sans-serif" }}>{i + 1}</span>
                }
              </div>
              <span style={{ fontSize: 12, color: i === step ? '#F5F5F0' : '#555', fontWeight: i === step ? 600 : 400 }}>{s}</span>
            </div>
          ))}
        </div>
        <div style={{ height: 3, background: '#1E1E1E', borderRadius: 2 }}>
          <div style={{ height: '100%', background: 'linear-gradient(90deg, #1A7A4A, #22A861)', borderRadius: 2, width: `${(step / 2) * 100}%`, transition: 'width 0.4s ease' }} />
        </div>
      </div>

      {/* ─── Step 0: Profile ─────────────────────────────────────────────── */}
      {step === 0 && (
        <div>
          <div style={{ marginBottom: 28, textAlign: 'center' }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 26, color: '#F5F5F0', letterSpacing: '-0.02em', marginBottom: 6 }}>
              Set up your profile
            </h2>
            <p style={{ fontSize: 14, color: '#6A6A60' }}>Let your followers know who you are</p>
          </div>

          {error && <Alert type="error" message={error} />}

          {/* Avatar placeholder */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'linear-gradient(135deg, #1A7A4A, #D4A017)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, color: 'white', fontFamily: "'Syne', sans-serif", fontWeight: 800,
              cursor: 'pointer', border: '3px solid #2A2A2A',
              position: 'relative',
            }}>
              P
              <div style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 24, height: 24, borderRadius: '50%',
                background: '#1A7A4A', border: '2px solid #0A0A0A',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13,
              }}>+</div>
            </div>
          </div>

          <form onSubmit={handleSubmit(handleProfileSubmit)} noValidate>

            <FormField label="Username" placeholder="your_handle" hint="@yourhandle — this is how people find you" error={errors.username?.message} {...register('username')} />
            <FormField label="Bio" placeholder="Tell the world who you are (optional)" error={errors.bio?.message} {...register('bio')} />
            <SubmitButton loading={loading}>Continue <ChevronRight size={16} /></SubmitButton>
          </form>
        </div>
      )}

      {/* ─── Step 1: Interests ────────────────────────────────────────────── */}
      {step === 1 && (
        <div>
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 26, color: '#F5F5F0', letterSpacing: '-0.02em', marginBottom: 6 }}>
              What are you into?
            </h2>
            <p style={{ fontSize: 14, color: '#6A6A60' }}>
              Pick at least 3 — we&apos;ll personalise your feed
              <br />
              <span style={{ color: selectedInterests.length >= 3 ? '#22A861' : '#555' }}>
                {selectedInterests.length}/10 selected
              </span>
            </p>
          </div>

          {error && <Alert type="error" message={error} />}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
            {NIGERIAN_INTERESTS.map(interest => {
              const selected = selectedInterests.includes(interest.id)
              return (
                <button
                  key={interest.id}
                  onClick={() => toggleInterest(interest.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 100,
                    border: `1.5px solid ${selected ? '#1A7A4A' : '#2A2A2A'}`,
                    background: selected ? 'rgba(26,122,74,0.12)' : '#181818',
                    color: selected ? '#22A861' : '#9A9A90',
                    fontSize: 13, fontWeight: selected ? 600 : 400,
                    cursor: 'pointer', transition: 'all 0.15s',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  <span style={{ fontSize: 14 }}>{interest.emoji}</span>
                  {interest.label}
                  {selected && <Check size={12} />}
                </button>
              )
            })}
          </div>

          <button
            onClick={handleInterestsContinue}
            disabled={loading || selectedInterests.length < 3}
            className="para-btn-primary"
          >
            {loading ? 'Saving...' : `Continue with ${selectedInterests.length} interest${selectedInterests.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* ─── Step 2: Suggested follows ───────────────────────────────────── */}
      {step === 2 && (
        <div>
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 26, color: '#F5F5F0', letterSpacing: '-0.02em', marginBottom: 6 }}>
              Follow some accounts
            </h2>
            <p style={{ fontSize: 14, color: '#6A6A60' }}>Start with some popular Nigerian voices on Spup</p>
          </div>

          <div style={{ marginBottom: 24 }}>
            {SUGGESTED_ACCOUNTS.map(account => (
              <div key={account.username} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 0',
                borderBottom: '1px solid #1A1A1A',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: account.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Syne', sans-serif", fontWeight: 700,
                  fontSize: 14, color: 'white', flexShrink: 0,
                }}>
                  {account.avatar}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#F5F5F0' }}>{account.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#555' }}>@{account.username} · {account.followers} followers</div>
                  <div style={{ fontSize: 13, color: '#6A6A60', marginTop: 2 }}>{account.bio}</div>
                </div>
                <button
                  onClick={() => toggleFollow(account.username)}
                  style={{
                    padding: '7px 16px', borderRadius: 20,
                    border: `1.5px solid ${followed.has(account.username) ? '#2A2A2A' : '#1A7A4A'}`,
                    background: followed.has(account.username) ? 'transparent' : '#1A7A4A',
                    color: followed.has(account.username) ? '#9A9A90' : 'white',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    fontFamily: "'Syne', sans-serif",
                    transition: 'all 0.15s', flexShrink: 0,
                  }}
                >
                  {followed.has(account.username) ? 'Following' : 'Follow'}
                </button>
              </div>
            ))}
          </div>

          <button onClick={handleComplete} disabled={loading} className="para-btn-primary">
            {loading ? 'Setting up your feed...' : 'Go to Spup →'}
          </button>

          <button
            onClick={handleComplete}
            style={{ width: '100%', marginTop: 12, background: 'none', border: 'none', fontSize: 13, color: '#3A3A35', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
          >
            Skip for now
          </button>
        </div>
      )}
    </div>
  )
}