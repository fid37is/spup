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
import type { ReplyToContext, EditPostContext } from '@/app/(main)/feed/post-composer'
import { isWithinEditWindow } from '@/lib/post-edit'

export const metadata = { title: 'New post' }

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ replyTo?: string; returnTo?: string; edit?: string }>
}) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const { replyTo: replyToId, returnTo, edit: editId } = await searchParams

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

  // ?edit=<postId>: the same screen, opened on one of your own posts. Anything that
  // could not be saved anyway (not yours, a repost, the 15 minutes are up) goes back
  // to the post instead of opening an editor that would only fail.
  let editPost: EditPostContext | null = null
  if (editId) {
    const target = await getPostById(editId)
    if (!target || !viewer || target.author.id !== viewer.id || target.post_type === 'repost' || !isWithinEditWindow(target.created_at)) {
      redirect(target ? `/post/${editId}` : '/feed')
    }
    editPost = {
      id: target.id,
      body: target.body ?? '',
      createdAt: target.created_at,
      isReply: target.post_type === 'reply',
      isSelling: !!target.is_selling,
      media: [...(target.media ?? [])]
        .sort((a, b) => a.position - b.position)
        .map(m => ({ url: m.url, media_type: m.media_type as 'image' | 'video', thumbnail_url: m.thumbnail_url })),
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
      editPost={editPost}
    />
  )
}