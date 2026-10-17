'use client'

// src/components/settings/kyc-flow.tsx
//
// Shared flow for /settings/verify-nin and /settings/verify-bvn:
//   not verified yet:  Premium needed? -> phone needed? -> ID + selfie -> done
// Premium is only needed to START. Verification is permanent afterwards.
// All eligibility decisions are made on the server; this only displays them.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck, CheckCircle, Lock, Camera, Loader2, Crown } from 'lucide-react'
import SubscribeButton from '@/components/premium/subscribe-button'
import { verifyNinAction } from '@/lib/actions/nin-kyc'
import { verifyBvnAction } from '@/lib/actions/bvn-kyc'
import { getKycStatusAction } from '@/lib/actions/premium'
import { useTranslation } from '@/lib/i18n/language-context'

type Kind = 'nin' | 'bvn'
type Stage = 'loading' | 'premium' | 'phone-first' | 'enter' | 'success' | 'already'

const INP: React.CSSProperties = {
  width: '100%', background: '#131318', border: '1px solid #1E1E26',
  borderRadius: 10, padding: '12px 14px', color: '#F0F0EC', fontSize: 15,
  outline: 'none', fontFamily: "'DM Sans', sans-serif",
  transition: 'border-color 0.15s', letterSpacing: '0.1em',
}
// Buttons are always small and right-aligned (wrap in ROW_RIGHT).
const PRIMARY_BTN: React.CSSProperties = {
  background: '#1A9E5F', color: 'white', border: 'none',
  borderRadius: 10, padding: '8px 18px', fontFamily: "'Syne', sans-serif",
  fontWeight: 700, fontSize: 13, cursor: 'pointer', letterSpacing: '0.01em',
  transition: 'opacity 0.15s', display: 'inline-block', textDecoration: 'none', whiteSpace: 'nowrap',
}
const ROW_RIGHT: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end' }

// Shrink the selfie before upload: phone cameras produce 3–8 MB photos, which
// are slow on mobile data and would exceed the server-action size limit.
async function fileToSmallJpegBase64(file: File, maxSide = 720): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('image'))
      i.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function KycFlow({ kind }: { kind: Kind }) {
  const { t } = useTranslation()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('loading')
  const [attemptsLeft, setAttemptsLeft] = useState(0)
  const [priceKobo, setPriceKobo] = useState(0)
  const [idNumber, setIdNumber] = useState('')
  const [selfie, setSelfie] = useState('')           // raw base64 JPEG
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getKycStatusAction(kind).then(s => {
      if ('error' in s) { setError(s.error); setStage('premium'); return }
      setAttemptsLeft(s.attempts_left)
      setPriceKobo(s.premium_price_kobo)
      if (s.already_verified) { setStage('already'); return }
      if (!s.premium_active) { setStage('premium'); return }
      if (!s.phone_verified) { setStage('phone-first'); return }
      setStage('enter')
    })
  }, [kind])

  async function handleSelfie(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    try {
      setSelfie(await fileToSmallJpegBase64(file))
    } catch {
      setError(t('kyc.selfie_required'))
    }
  }

  async function handleSubmit() {
    if (idNumber.length !== 11) { setError(t(`wallet.${kind}_must_be_11`)); return }
    if (!selfie) { setError(t('kyc.selfie_required')); return }
    setError('')
    setSubmitting(true)
    try {
      const action = kind === 'nin' ? verifyNinAction : verifyBvnAction
      const r = await action(idNumber, selfie)
      if ('success' in r && r.success) { setStage('success'); return }
      if ('error' in r && r.error) {
        setError(r.error)
        if (typeof r.attempts_left === 'number') setAttemptsLeft(r.attempts_left)
        if (r.premium_required) { setStage('premium'); return }
        if (r.limit_reached) { setAttemptsLeft(0); return }
        setSelfie('')   // a failed selfie match needs a fresh photo
      }
    } catch {
      setError(t('wallet.network_error_retry'))
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = idNumber.length === 11 && !!selfie && !submitting && attemptsLeft > 0

  const Header = ({ sub }: { sub?: string }) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 24 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(26,158,95,0.1)', border: '1px solid rgba(26,158,95,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <ShieldCheck size={22} color="#1A9E5F" />
      </div>
      <div>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: '#F0F0EC', letterSpacing: '-0.02em', marginBottom: 4 }}>
          {t(`wallet.verify_your_${kind}_title`)}
        </h1>
        {sub && <p style={{ fontSize: 13, color: '#6A6A60', lineHeight: 1.5 }}>{sub}</p>}
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '28px 20px', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@keyframes kyc-spin { to { transform: rotate(360deg); } }`}</style>

      <Link href="/wallet" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#6A6A60', textDecoration: 'none', marginBottom: 28 }}>
        <ArrowLeft size={16} /> {t('wallet.back_to_wallet')}
      </Link>

      {stage === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6A6A60', fontSize: 14 }}>
          <Loader2 size={16} style={{ animation: 'kyc-spin 1s linear infinite' }} /> {t('kyc.checking')}
        </div>
      )}

      {stage === 'already' && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <CheckCircle size={36} color="#1A9E5F" style={{ marginBottom: 16 }} />
          <p style={{ fontSize: 15, color: '#F0F0EC', marginBottom: 24 }}>{t('kyc.already_verified')}</p>
          <div style={ROW_RIGHT}><button onClick={() => router.push('/wallet')} style={PRIMARY_BTN}>{t('wallet.back_to_wallet')}</button></div>
        </div>
      )}

      {/* Premium needed — the very first thing an unsubscribed user sees */}
      {stage === 'premium' && (
        <div>
          <Header />
          <div style={{ display: 'flex', gap: 10, background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.25)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
            <Crown size={18} color="#D4A017" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 14, color: '#F0F0EC', lineHeight: 1.6, margin: 0 }}>{error || t('kyc.premium_needed')}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Link href="/premium/learn" style={{ fontSize: 13, color: '#8A8A85', textDecoration: 'underline' }}>{t('premium.how_it_works')}</Link>
            {priceKobo > 0
              ? <SubscribeButton priceKobo={priceKobo} />
              : <Link href="/wallet#premium" style={PRIMARY_BTN}>{t('premium.see_premium')}</Link>}
          </div>
        </div>
      )}

      {stage === 'phone-first' && (
        <div>
          <Header />
          <p style={{ fontSize: 15, color: '#F0F0EC', lineHeight: 1.6, marginBottom: 20 }}>{t('kyc.phone_first')}</p>
          <div style={ROW_RIGHT}>
            <Link href="/settings/verify-phone" style={PRIMARY_BTN}>{t('kyc.phone_first_cta')}</Link>
          </div>
        </div>
      )}

      {stage === 'enter' && (
        <div>
          <Header sub={t('kyc.attempts_left', { n: attemptsLeft })} />

          {error && (
            <div style={{ background: 'rgba(229,57,53,0.08)', border: '1px solid rgba(229,57,53,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: '#E57373' }}>{error}</div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: '#8A8A85', display: 'block', marginBottom: 6, fontWeight: 500 }}>{t(`wallet.${kind}_label`)}</label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#44444A', pointerEvents: 'none' }} />
              <input
                type="text" inputMode="numeric" placeholder="12345678901" value={idNumber}
                onChange={e => { setIdNumber(e.target.value.replace(/\D/g, '').slice(0, 11)); setError('') }}
                style={{ ...INP, paddingLeft: 38 }}
              />
            </div>
            <p style={{ fontSize: 12, color: '#44444A', marginTop: 6 }}>{t(`wallet.${kind}_dial_hint`)}</p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, color: '#8A8A85', display: 'block', marginBottom: 6, fontWeight: 500 }}>{t('kyc.selfie_label')}</label>
            <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={handleSelfie} style={{ display: 'none' }} />
            {selfie && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`data:image/jpeg;base64,${selfie}`} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 12, border: '1px solid #1E1E26', display: 'block', marginBottom: 10 }} />
            )}
            <button
              type="button" onClick={() => fileRef.current?.click()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#131318', border: '1px solid #1E1E26', color: '#F0F0EC', borderRadius: 10, padding: '11px 16px', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
            >
              <Camera size={16} /> {selfie ? t('kyc.retake_selfie') : t('kyc.take_selfie')}
            </button>
            <p style={{ fontSize: 12, color: '#44444A', marginTop: 8, lineHeight: 1.5 }}>{t('kyc.selfie_hint')}</p>
          </div>

          <div style={ROW_RIGHT}>
            <button onClick={handleSubmit} disabled={!canSubmit} style={{ ...PRIMARY_BTN, opacity: canSubmit ? 1 : 0.5 }}>
              {submitting ? t('wallet.verifying') : t(`wallet.verify_${kind}_cta`)}
            </button>
          </div>
        </div>
      )}

      {stage === 'success' && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(26,158,95,0.1)', border: '2px solid rgba(26,158,95,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <CheckCircle size={36} color="#1A9E5F" />
          </div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em', marginBottom: 10 }}>
            {t(`wallet.${kind}_verified_title`)}
          </h1>
          <p style={{ fontSize: 15, color: '#6A6A60', lineHeight: 1.6, marginBottom: 32 }}>{t(`wallet.${kind}_verified_desc`)}</p>
          <div style={ROW_RIGHT}><button onClick={() => router.push('/wallet')} style={PRIMARY_BTN}>{t('wallet.back_to_wallet')}</button></div>
        </div>
      )}
    </div>
  )
}