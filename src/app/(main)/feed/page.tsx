import { createClient } from '@/lib/supabase/server'
import { getForYouFeedAction } from '@/lib/actions'
import FeedClient from './feed-client'
import { redirect } from 'next/navigation'

export default async function FeedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: viewer } = await supabase
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()
  const currentUserId = viewer?.id ?? undefined

  // Race the feed fetch against a 8s timeout so we never hit Next.js's 10s
  // server-render limit. On timeout we render with empty posts and let the
  // client-side infinite scroll fetch on mount instead.
  let posts: any[] = []
  let nextCursor: string | null = null

  try {
    const result = await Promise.race([
      getForYouFeedAction(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('feed_timeout')), 8000)
      ),
    ])
    posts = result.posts
    nextCursor = result.nextCursor
  } catch (err: any) {
    if (err?.message !== 'feed_timeout') {
      // Real error — still render empty shell, client will retry
      console.error('[FeedPage] getForYouFeedAction failed:', err)
    }
  }

  return <FeedClient initialPosts={posts} initialCursor={nextCursor} currentUserId={currentUserId} />
}