// src/app/(main)/settings/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import { ArrowLeft }    from 'lucide-react'
import Link             from 'next/link'
import SettingsClient   from './settings-client'

export const metadata = {
  title: 'Settings — Spup',
  robots: { index: false, follow: false }, // settings never indexed
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select(`
      id, username, display_name,
      email, phone_number,
      is_private, bvn_verified,
      language_preference,
      notif_push, notif_email
    `)
    .eq('auth_id', user.id)
    .single()

  if (!profile) redirect('/login')

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
        <Link
          href="/profile"
          aria-label="Back to profile"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: '50%',
            color: 'var(--color-text-primary)',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18,
          color: 'var(--color-text-primary)', margin: 0,
        }}>
          Settings
        </h1>
      </div>

      <SettingsClient profile={profile} />
    </div>
  )
}