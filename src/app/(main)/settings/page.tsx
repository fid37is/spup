import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SettingsClient from './settings-client'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id, username, display_name, bio, phone_number, email, language_preference, is_private')
    .eq('auth_id', user.id)
    .single()

  return (
    <div>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(20px)', background: 'rgba(10,10,10,0.9)', borderBottom: '1px solid #1A1A1A', padding: '16px 20px' }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: '#F5F5F0' }}>Settings</h1>
      </div>
      <SettingsClient profile={profile} />
    </div>
  )
}