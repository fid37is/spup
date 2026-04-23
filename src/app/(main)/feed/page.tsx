import { createClient } from '@/lib/supabase'
import { getForYouFeedAction } from '@/lib/actions'
import FeedClient from './feed-client'

export default async function FeedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Initial server render — client takes over for infinite scroll
  const { posts, nextCursor } = await getForYouFeedAction()

  return <FeedClient initialPosts={posts} initialCursor={nextCursor} />
}
