// src/app/(auth)/complete-profile/page.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { completeSocialProfileSchema, type CompleteSocialProfileSchema } from '@/lib/validations/schemas'
import { completeSocialProfileAction } from '@/lib/actions'
import { AuthCard, Alert } from '@/components/auth/form-field'
import { useTranslation } from '@/lib/i18n/language-context'
import { tv } from '@/lib/i18n/validation'

const inp = (err?: string): React.CSSProperties => ({
  width:'100%', background:'#131318', border:`1px solid ${err?'#E53935':'#1E1E26'}`,
  borderRadius:10, padding:'11px 14px', color:'#F0F0EC', fontSize:15,
  outline:'none', fontFamily:"'DM Sans', sans-serif",
})
const lbl: React.CSSProperties = { fontSize:12, color:'#8A8A85', display:'block', marginBottom:6, fontWeight:500 }

export default function CompleteProfilePage() {
  const router = useRouter()
  const { t } = useTranslation()
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
      title={t('auth.one_more_thing')}
      subtitle={t('auth.complete_account_subtitle')}
    >
      {serverError && <Alert type="error" message={serverError} />}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div style={{ marginBottom:14 }}>
          <label style={lbl}>{t('auth.full_name')}</label>
          <input {...register('full_name')} type="text" placeholder={t('auth.your_full_name')} autoComplete="name" autoFocus style={inp(errors.full_name?.message)} />
          {errors.full_name && <p style={{ fontSize:12, color:'#E53935', marginTop:5 }}>{tv(t, errors.full_name.message)}</p>}
        </div>

        <div style={{ marginBottom:22 }}>
          <label style={lbl}>{t('auth.date_of_birth')}</label>
          <input {...register('date_of_birth')} type="date" max={maxDobStr} style={{ ...inp(errors.date_of_birth?.message), colorScheme:'dark' }} />
          {errors.date_of_birth
            ? <p style={{ fontSize:12, color:'#E53935', marginTop:5 }}>{tv(t, errors.date_of_birth.message)}</p>
            : <p style={{ fontSize:11, color:'#44444A', marginTop:5 }}>{t('auth.dob_hint_profile')}</p>
          }
        </div>

        <button type="submit" disabled={isPending} className="para-btn-primary">
          {isPending ? t('auth.saving') : t('auth.continue_to_spup')}
        </button>
      </form>

      {/* Privacy note */}
      <div style={{ marginTop:20, background:'#0D0D12', border:'1px solid #1E1E26', borderRadius:10, padding:'12px 14px' }}>
        <p style={{ fontSize:12, color:'#44444A', lineHeight:1.6 }}>
          {t('auth.dob_privacy_note')}
        </p>
      </div>
    </AuthCard>
  )
}