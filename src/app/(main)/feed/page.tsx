import { createClient, getAuthUser } from '@/lib/supabase/server'
import { getForYouFeedAction } from '@/lib/actions'
import FeedClient from './feed-client'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { SEEN_COOKIE, parseSeenCookie, makeSeed, type FeedSession } from '@/lib/feed/seen'

export default async function FeedPage() {
  // Same request as the (main) layout's lookup - deduped, not a second call.
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // This feed session: a fresh random seed (so this open doesn't rank exactly
  // like the last one) plus the posts this person was already served recently
  // (kept in a cookie by the feed itself) - those sort below anything new.
  // Frozen here and handed to the client, which sends the same pair with every
  // "load more" so later pages continue the order this page started.
  const session: FeedSession = {
    seed: makeSeed(),
    seen: parseSeenCookie((await cookies()).get(SEEN_COOKIE)?.value),
  }

  // Race the feed fetch against a 8s timeout so we never hit Next.js's 10s
  // server-render limit. On timeout we render with empty posts and let the
  // client-side infinite scroll fetch on mount instead.
  //
  // Started first so it runs alongside the viewer lookup below instead of
  // waiting for it (they don't depend on each other).
  const feedPromise = Promise.race([
    getForYouFeedAction(undefined, session),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('feed_timeout')), 8000)
    ),
  ]).catch((err: any) => {
    if (err?.message !== 'feed_timeout') {
      // Real error - still render empty shell, client will retry
      console.error('[FeedPage] getForYouFeedAction failed:', err)
    }
    return null
  })

  const [{ data: viewer }, result] = await Promise.all([
    supabase.from('users').select('id, avatar_url, display_name').eq('auth_id', user.id).maybeSingle(),
    feedPromise,
  ])
  const currentUserId = viewer?.id ?? undefined

  const posts: any[] = result?.posts ?? []
  const nextCursor: string | null = result?.nextCursor ?? null

  return (
    <FeedClient
      initialPosts={posts}
      initialCursor={nextCursor}
      initialSession={session}
      currentUserId={currentUserId}
      currentUserAvatarUrl={viewer?.avatar_url ?? null}
      currentUserDisplayName={viewer?.display_name ?? null}
    />
  )
}