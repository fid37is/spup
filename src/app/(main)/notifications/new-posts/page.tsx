// src/app/(main)/notifications/new-posts/page.tsx
//
// The "New post notifications" pane opens here: the posts from people you
// turned post notifications on for, rendered as real feed posts, in the order
// they came in.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getNewPostsFeedAction } from '@/lib/actions/notifications'
import NewPostsClient from './new-posts-client'

export const metadata = {
  title: 'New posts - Spup',
  robots: { index: false, follow: false },
}

export default async function NewPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const { data: viewer } = await supabase
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()

  // Always load everyone's posts so switching between people in the strip is
  // instant; the optional ?user= just preselects one.
  const { posts, users } = await getNewPostsFeedAction()

  return (
    <NewPostsClient
      posts={posts}
      users={users}
      currentUserId={viewer?.id}
      initialUsername={sp?.user ?? null}
    />
  )
}
