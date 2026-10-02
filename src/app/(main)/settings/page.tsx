// src/app/(main)/settings/page.tsx

import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import BackButton from '@/components/ui/back-button'
import SettingsClient   from './settings-client'

export const metadata = {
  title: 'Settings — Spup',
  robots: { index: false, follow: false }, // settings never indexed
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: baseProfile } = await supabase
    .from('users')
    .select(`
      id, username, display_name,
      is_private, bvn_verified, nin_verified,
      language_preference
    `)
    .eq('auth_id', user.id)
    .single()

  if (!baseProfile) redirect('/login')

  // email, phone number and notification flags are private columns: the API
  // won't return them from the users table, only through this function (it
  // returns the signed-in user's own values and nothing else).
  const { data: priv } = await supabase.rpc('get_my_private_profile')
  const profile = {
    ...baseProfile,
    email: (priv?.email ?? null) as string | null,
    phone_number: (priv?.phone_number ?? null) as string | null,
    notif_push: priv?.notif_push,
    notif_email: priv?.notif_email,
  }

  const { data: interestRows } = await supabase
    .from('user_interests')
    .select('interest')
    .eq('user_id', profile.id)

  const interests = (interestRows ?? []).map(r => r.interest)

  return (
    <div>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        padding: '0 20px',
        display: 'flex', alignItems: 'center', gap: 12,
        height: 56,
      }}>
        <BackButton fallbackHref="/profile" label="Back to profile" />
        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18,
          color: 'var(--color-text-primary)', margin: 0,
        }}>
          Settings
        </h1>
      </div>

      <SettingsClient profile={profile} interests={interests} />
    </div>
  )
}