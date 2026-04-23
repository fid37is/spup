// src/app/(auth)/complete-profile/page.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { completeSocialProfileSchema, type CompleteSocialProfileSchema } from '@/lib/validations/schemas'
import { completeSocialProfileAction } from '@/lib/actions'
import { AuthCard, Alert } from '@/components/auth/form-field'

const inp = (err?: string): React.CSSProperties => ({
  width:'100%', background:'#131318', border:`1px solid ${err?'#E53935':'#1E1E26'}`,
  borderRadius:10, padding:'11px 14px', color:'#F0F0EC', fontSize:15,
  outline:'none', fontFamily:"'DM Sans', sans-serif",
})
const lbl: React.CSSProperties = { fontSize:12, color:'#8A8A85', display:'block', marginBottom:6, fontWeight:500 }

export default function CompleteProfilePage() {
  const router = useRouter()
  const [serverError, setServerError] = useState('')
  const [isPending, startT] = useTransition()

  const { register, handleSubmit, formState:{ errors } } = useForm<CompleteSocialProfileSchema>({
    resolver: zodResolver(completeSocialProfileSchema),
  })

  const maxDob = new Date()
  maxDob.setFullYear(maxDob.getFullYear() - 13)
  const maxDobStr = maxDob.toISOString().split('T')[0]

  function onSubmit(data: CompleteSocialProfileSchema) {
    setServerError('')
    startT(async () => {
      const r = await completeSocialProfileAction(data)
      if (r.error) { setServerError(r.error); return }
      router.push('/onboarding')
      router.refresh()
    })
  }

  return (
    <AuthCard
      title="One more thing"
      subtitle="We need a couple of details to complete your account"
    >
      {serverError && <Alert type="error" message={serverError} />}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div style={{ marginBottom:14 }}>
          <label style={lbl}>Full name</label>
          <input {...register('full_name')} type="text" placeholder="Your full name" autoComplete="name" autoFocus style={inp(errors.full_name?.message)} />
          {errors.full_name && <p style={{ fontSize:12, color:'#E53935', marginTop:5 }}>{errors.full_name.message}</p>}
        </div>

        <div style={{ marginBottom:22 }}>
          <label style={lbl}>Date of birth</label>
          <input {...register('date_of_birth')} type="date" max={maxDobStr} style={{ ...inp(errors.date_of_birth?.message), colorScheme:'dark' }} />
          {errors.date_of_birth
            ? <p style={{ fontSize:12, color:'#E53935', marginTop:5 }}>{errors.date_of_birth.message}</p>
            : <p style={{ fontSize:11, color:'#44444A', marginTop:5 }}>Must be 13 or older. Never shown publicly.</p>
          }
        </div>

        <button type="submit" disabled={isPending} className="para-btn-primary">
          {isPending ? 'Saving…' : 'Continue to Spup'}
        </button>
      </form>

      {/* Privacy note */}
      <div style={{ marginTop:20, background:'#0D0D12', border:'1px solid #1E1E26', borderRadius:10, padding:'12px 14px' }}>
        <p style={{ fontSize:12, color:'#44444A', lineHeight:1.6 }}>
          Your date of birth is used to verify your age and personalise your experience. It is stored securely and never displayed on your profile.
        </p>
      </div>
    </AuthCard>
  )
}