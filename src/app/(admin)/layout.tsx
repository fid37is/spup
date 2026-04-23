// src/app/(admin)/layout.tsx
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import AdminNav from '@/components/admin/admin-nav'

export const metadata = { title: { default: 'Spup Admin', template: '%s | Admin' }, robots: { index: false } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Use admin client to bypass RLS for role check
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('id, role, display_name, username')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'moderator'].includes(profile.role)) {
    redirect('/feed')  // silently redirect non-admins
  }

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: '#050508', fontFamily: "'DM Sans', sans-serif" }}>
      <AdminNav profile={profile} />
      <main style={{ flex: 1, minWidth: 0, padding: '0 0 60px' }}>
        {children}
      </main>
    </div>
  )
}