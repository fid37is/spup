// src/app/(main)/settings/verify-nin/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { verifyNinAction } from '@/lib/actions/nin-kyc'
import { ArrowLeft, ShieldCheck, CheckCircle, Lock } from 'lucide-react'
import Link from 'next/link'

const INP: React.CSSProperties = {
  width: '100%', background: '#131318', border: '1px solid #1E1E26',
  borderRadius: 10, padding: '12px 14px', color: '#F0F0EC', fontSize: 15,
  outline: 'none', fontFamily: "'DM Sans', sans-serif",
  transition: 'border-color 0.15s', letterSpacing: '0.1em',
}

type Stage = 'enter-nin' | 'success'

export default function VerifyNinPage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('enter-nin')
  const [nin, setNin]         = useState('')
  const [error, setError]     = useState('')
  const [pending, setPending] = useState(false)

  function handleChange(val: string) {
    setNin(val.replace(/\D/g, '').slice(0, 11))
    setError('')
  }

  function handleSubmit() {
    if (nin.length !== 11) { setError('NIN must be exactly 11 digits.'); return }
    setError('')
    setPending(true)
    verifyNinAction(nin).then(r => {
      setPending(false)
      if (r.error) { setError(r.error); return }
      setStage('success')
    })
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '28px 20px', fontFamily: "'DM Sans', sans-serif" }}>

      <Link href="/wallet" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#6A6A60', textDecoration: 'none', marginBottom: 28 }}>
        <ArrowLeft size={16} /> Back to wallet
      </Link>

      {stage === 'success' ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(26,158,95,0.1)', border: '2px solid rgba(26,158,95,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <CheckCircle size={36} color="#1A9E5F" />
          </div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em', marginBottom: 10 }}>
            NIN verified!
          </h1>
          <p style={{ fontSize: 15, color: '#6A6A60', lineHeight: 1.6, marginBottom: 32 }}>
            You can now withdraw your earnings, and your verified badge will appear on your profile.
          </p>
          <button
            onClick={() => router.push('/wallet')}
            style={{ background: '#1A9E5F', color: 'white', border: 'none', borderRadius: 10, padding: '13px 32px', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
          >
            Back to wallet
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 28 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(26,158,95,0.1)', border: '1px solid rgba(26,158,95,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ShieldCheck size={22} color="#1A9E5F" />
            </div>
            <div>
              <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 22, color: '#F0F0EC', letterSpacing: '-0.02em', marginBottom: 4 }}>
                Verify your NIN
              </h1>
              <p style={{ fontSize: 14, color: '#6A6A60', lineHeight: 1.5 }}>
                Required once, before your first withdrawal. You can keep using Spup and earning without this until then.
              </p>
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(229,57,53,0.08)', border: '1px solid rgba(229,57,53,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: '#E57373' }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: '#8A8A85', display: 'block', marginBottom: 6, fontWeight: 500 }}>
              National Identification Number (NIN)
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#44444A', pointerEvents: 'none' }} />
              <input
                type="text"
                inputMode="numeric"
                placeholder="12345678901"
                value={nin}
                onChange={e => handleChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                autoFocus
                style={{ ...INP, paddingLeft: 38 }}
              />
            </div>
            <p style={{ fontSize: 12, color: '#44444A', marginTop: 6 }}>
              Dial *346# on your registered line to retrieve your NIN if you don&apos;t have it saved. We never store your raw NIN — only a verification reference.
            </p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={pending || nin.length !== 11}
            style={{
              width: '100%', background: '#1A9E5F', color: 'white', border: 'none',
              borderRadius: 10, padding: '13px', fontFamily: "'Syne', sans-serif",
              fontWeight: 700, fontSize: 15, cursor: 'pointer', letterSpacing: '0.01em',
              opacity: (pending || nin.length !== 11) ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {pending ? 'Verifying…' : 'Verify NIN'}
          </button>
        </div>
      )}
    </div>
  )
}
