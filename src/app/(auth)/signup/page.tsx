// src/app/(auth)/signup/page.tsx
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { signupSchema, type SignupSchema } from '@/lib/validations/schemas'
import { signUpAction } from '@/lib/actions'
import { AuthCard, Alert } from '@/components/auth/form-field'
import OAuthButtons, { AuthDivider } from '@/components/auth/oauth-buttons'
import { Eye, EyeOff } from 'lucide-react'

const inp = (err?: string): React.CSSProperties => ({
  width:'100%', background:'#131318', border:`1px solid ${err?'#E53935':'#1E1E26'}`,
  borderRadius:10, padding:'11px 14px', color:'#F0F0EC', fontSize:15,
  outline:'none', fontFamily:"'DM Sans', sans-serif",
  transition:'border-color 0.15s',
})
const lbl: React.CSSProperties = { fontSize:12, color:'#8A8A85', display:'block', marginBottom:6, fontWeight:500 }

export default function SignupPage() {
  const router = useRouter()
  const [serverError, setServerError] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showCf, setShowCf] = useState(false)
  const [isPending, startT] = useTransition()

  const { register, handleSubmit, watch, formState:{ errors } } = useForm<SignupSchema>({ resolver: zodResolver(signupSchema) })

  const pw = watch('password','')
  const strength = [/[A-Z]/.test(pw), /[0-9]/.test(pw), pw.length>=8, /[^A-Za-z0-9]/.test(pw)].filter(Boolean).length
  const strengthColor = ['','#E53935','#D4A017','#1A9E5F','#1A9E5F'][strength]
  const strengthLabel = ['','Weak','Fair','Good','Strong'][strength]

  function onSubmit(data: SignupSchema) {
    setServerError('')
    startT(async () => {
      const r = await signUpAction(data)
      if (r.error) { setServerError(r.error); return }
      if (r.success && r.email) router.push(`/verify-email?email=${encodeURIComponent(r.email)}`)
    })
  }

  // Max DOB = today minus 13 years
  const maxDob = new Date()
  maxDob.setFullYear(maxDob.getFullYear() - 13)
  const maxDobStr = maxDob.toISOString().split('T')[0]

  return (
    <AuthCard title="Join today." subtitle="Create your Spup account">

      {serverError && <Alert type="error" message={serverError} />}

      {/* Social auth */}
      <OAuthButtons mode="signup" />
      <AuthDivider />

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* Full name */}
        <div style={{ marginBottom:14 }}>
          <label style={lbl}>Full name</label>
          <input {...register('full_name')} type="text" placeholder="Chioma Obi" autoComplete="name" style={inp(errors.full_name?.message)} />
          {errors.full_name && <p style={{ fontSize:12, color:'#E53935', marginTop:5 }}>{errors.full_name.message}</p>}
        </div>

        {/* Email */}
        <div style={{ marginBottom:14 }}>
          <label style={lbl}>Email address</label>
          <input {...register('email')} type="email" placeholder="you@email.com" autoComplete="email" inputMode="email" style={inp(errors.email?.message)} />
          {errors.email && <p style={{ fontSize:12, color:'#E53935', marginTop:5 }}>{errors.email.message}</p>}
        </div>

        {/* Date of birth */}
        <div style={{ marginBottom:14 }}>
          <label style={lbl}>Date of birth</label>
          <input {...register('date_of_birth')} type="date" max={maxDobStr} style={{ ...inp(errors.date_of_birth?.message), colorScheme:'dark' }} />
          {errors.date_of_birth
            ? <p style={{ fontSize:12, color:'#E53935', marginTop:5 }}>{errors.date_of_birth.message}</p>
            : <p style={{ fontSize:11, color:'#44444A', marginTop:5 }}>Must be 13 or older. Not shown publicly.</p>
          }
        </div>

        {/* Password */}
        <div style={{ marginBottom:14 }}>
          <label style={lbl}>Password</label>
          <div style={{ position:'relative' }}>
            <input {...register('password')} type={showPw?'text':'password'} placeholder="Min 8 chars, 1 uppercase, 1 number" autoComplete="new-password" style={{ ...inp(errors.password?.message), paddingRight:44 }} />
            <button type="button" onClick={()=>setShowPw(v=>!v)} style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#44444A', padding:4 }}>
              {showPw ? <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              : <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
            </button>
          </div>
          {pw && (
            <div style={{ marginTop:8 }}>
              <div style={{ display:'flex', gap:4, marginBottom:3 }}>
                {[1,2,3,4].map(i=><div key={i} style={{ flex:1, height:3, borderRadius:2, background:i<=strength?strengthColor:'#1E1E26', transition:'background 0.2s' }}/>)}
              </div>
              {strengthLabel && <span style={{ fontSize:11, color:strengthColor }}>{strengthLabel}</span>}
            </div>
          )}
          {errors.password && <p style={{ fontSize:12, color:'#E53935', marginTop:5 }}>{errors.password.message}</p>}
        </div>

        {/* Confirm password */}
        <div style={{ marginBottom:22 }}>
          <label style={lbl}>Confirm password</label>
          <div style={{ position:'relative' }}>
            <input {...register('confirm_password')} type={showCf?'text':'password'} placeholder="Repeat your password" autoComplete="new-password" style={{ ...inp(errors.confirm_password?.message), paddingRight:44 }} />
            <button type="button" onClick={()=>setShowCf(v=>!v)} style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#44444A', padding:4 }}>
              {showCf ? <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              : <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
            </button>
          </div>
          {errors.confirm_password && <p style={{ fontSize:12, color:'#E53935', marginTop:5 }}>{errors.confirm_password.message}</p>}
        </div>

        <button type="submit" disabled={isPending} className="para-btn-primary">
          {isPending ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p style={{ textAlign:'center', fontSize:14, color:'#44444A', marginTop:20 }}>
        Already have an account?{' '}
        <Link href="/login" style={{ color:'#1A9E5F', fontWeight:600, textDecoration:'none' }}>Sign in</Link>
      </p>
    </AuthCard>
  )
}