// src/app/(main)/profile/edit/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getProfileByAuthId } from '@/lib/queries'
import ProfileHeader from '@/components/profile/profile-header'

// Deliberately does NOT fetch posts, likes/reposts/bookmarks state, or
// mutuals — none of that is ever rendered while editing (ProfileHeader's
// 'edit' mode renders ProfileHeaderEdit, never ProfileHeaderView or
// ProfileTabs), so skipping those queries here is both correct and faster
// than routing edits through the main /profile page ever was.
export default async function EditProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfileByAuthId(user.id)
  if (!profile) redirect('/login')

  return (
    <div>
      <ProfileHeader
        profile={{
          ...profile,
          email:        (profile as any).email        ?? null,
          phone_number: (profile as any).phone_number ?? null,
          bvn_verified: (profile as any).bvn_verified ?? false,
        }}
        stats={{ following: '0', followers: '0', posts: '0', mutuals: '0' }}
        isOwner={true}
        mode="edit"
      />
    </div>
  )
}