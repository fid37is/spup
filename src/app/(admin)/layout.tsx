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
    <div className="flex min-h-[100dvh] flex-col bg-bg font-body text-primary md:flex-row">
      <AdminNav profile={profile} />
      <main className="min-w-0 flex-1">
        {children}
      </main>
    </div>
  )
}