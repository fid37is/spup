// src/app/(main)/compose/page.tsx
//
// New post AND replies (mobile), as a single real page. Opening the composer
// used to draw a sheet OVER the feed; the feed stayed underneath and could
// scroll/pan when the keyboard opened, leaving a gap between the composer and
// the keyboard. As its own page there is nothing underneath to move.
//
// ?replyTo=<postId> turns this into a reply composer: the same PostComposer,
// with the post being replied to shown above the textarea and posted with
// parent_post_id set - see ReplyToContext in post-composer.tsx. This is the
// same fullscreen composer new posts use, kept as ONE component rather than a
// second reply-only composer to keep in sync.

import { redirect } from 'next/navigation'
import { createClient, getAuthUser } from '@/lib/supabase/server'
import { getPostById, getReplyAncestors } from '@/lib/queries/posts'
import ComposeClient from './compose-client'
import type { ReplyToContext } from '@/app/(main)/feed/post-composer'

export const metadata = { title: 'New post' }

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ replyTo?: string; returnTo?: string }>
}) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const { replyTo: replyToId, returnTo } = await searchParams

  const supabase = await createClient()
  const { data: viewer } = await supabase
    .from('users').select('id, avatar_url, display_name').eq('auth_id', user.id).maybeSingle()

  // A missing/deleted target just drops the reply context - the person still
  // gets a working composer rather than an error for a stale link.
  let replyTo: ReplyToContext | null = null
  let replyChain: ReplyToContext[] = []
  if (replyToId) {
    const [target, ancestors] = await Promise.all([
      getPostById(replyToId),
      getReplyAncestors(replyToId),
    ])
    if (target) {
      replyTo = {
        id: target.id,
        authorName: target.author.display_name,
        authorUsername: target.author.username,
        authorAvatarUrl: target.author.avatar_url,
        body: target.body,
      }
      // Root-first, same order Threads stacks them: oldest context at the
      // top, the post you actually tapped "Reply" on right above your box.
      replyChain = ancestors.map(a => ({
        id: a.id,
        authorName: a.author.display_name,
        authorUsername: a.author.username,
        authorAvatarUrl: a.author.avatar_url,
        body: a.body,
      }))
    }
  }

  return (
    <ComposeClient
      userId={viewer?.id ?? undefined}
      authorAvatarUrl={viewer?.avatar_url ?? null}
      authorName={viewer?.display_name || 'You'}
      replyTo={replyTo}
      replyChain={replyChain}
      returnTo={returnTo}
    />
  )
}