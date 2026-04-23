// src/app/(auth)/forgot-password/page.tsx
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AuthCard, Alert } from '@/components/auth/form-field'
import { createBrowserClient } from '@/lib/supabase/client'
import { ArrowLeft, CheckCircle } from 'lucide-react'

const inp: React.CSSProperties = {
  width:'100%', background:'#131318', border:'1px solid #1E1E26',
  borderRadius:10, padding:'11px 14px', color:'#F0F0EC', fontSize:15,
  outline:'none', fontFamily:"'DM Sans', sans-serif",
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [isPending, startT] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !email.includes('@')) { setError('Enter a valid email address'); return }
    setError('')
    startT(async () => {
      const supabase = createBrowserClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) setError(error.message)
      else setSent(true)
    })
  }

  if (sent) {
    return (
      <AuthCard title="Check your inbox">
        <div style={{ textAlign:'center', padding:'8px 0' }}>
          <div style={{ width:60, height:60, borderRadius:'50%', background:'rgba(26,158,95,0.1)', border:'2px solid rgba(26,158,95,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
            <CheckCircle size={26} color="#1A9E5F" />
          </div>
          <p style={{ fontSize:15, color:'#6A6A60', lineHeight:1.6, marginBottom:24 }}>
            We sent a password reset link to <strong style={{ color:'#F0F0EC' }}>{email}</strong>. Check your spam folder if it doesn&apos;t arrive.
          </p>
          <Link href="/login" style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:14, color:'#1A9E5F', textDecoration:'none', fontWeight:600 }}>
            <ArrowLeft size={14}/> Back to sign in
          </Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Forgot password?" subtitle="Enter your email and we'll send you a reset link">
      {error && <Alert type="error" message={error} />}
      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:12, color:'#8A8A85', display:'block', marginBottom:6, fontWeight:500 }}>Email address</label>
          <input type="email" placeholder="you@email.com" value={email} onChange={e=>setEmail(e.target.value)} autoFocus autoComplete="email" inputMode="email" style={inp} />
        </div>
        <button type="submit" disabled={isPending} className="para-btn-primary">
          {isPending ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <div style={{ textAlign:'center', marginTop:20 }}>
        <Link href="/login" style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:14, color:'#44444A', textDecoration:'none' }}>
          <ArrowLeft size={14}/> Back to sign in
        </Link>
      </div>
    </AuthCard>
  )
}