// src/app/(main)/compose/page.tsx
//
// New post as a real page (phones). Opening the composer used to draw a sheet
// OVER the feed; the feed stayed underneath and could scroll/pan when the
// keyboard opened, leaving a gap between the composer and the keyboard. As its
// own page there is nothing underneath to move.

import { redirect } from 'next/navigation'
import { createClient, getAuthUser } from '@/lib/supabase/server'
import ComposeClient from './compose-client'

export const metadata = { title: 'New post' }

export default async function ComposePage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: viewer } = await supabase
    .from('users').select('id, avatar_url, display_name').eq('auth_id', user.id).maybeSingle()

  return (
    <ComposeClient
      userId={viewer?.id ?? undefined}
      authorAvatarUrl={viewer?.avatar_url ?? null}
      authorName={viewer?.display_name || 'You'}
    />
  )
}
