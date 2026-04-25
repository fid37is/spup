'use server'

/**
 * posts.ts — mutations that write to the posts table only.
 * Reads/queries live in lib/queries/posts.ts.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createPostSchema, type CreatePostSchema } from '@/lib/validations/schemas'

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, profile: null }
  const { data: profile } = await supabase.from('users').select('id, status').eq('auth_id', user.id).single()
  return { supabase, profile }
}

export async function createPostAction(data: CreatePostSchema) {
  const parsed = createPostSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (profile.status === 'suspended' || profile.status === 'banned') return { error: 'Your account is not eligible to post.' }
  const { body, parent_post_id, quoted_post_id, media_ids } = parsed.data
  const postType = parent_post_id ? 'reply' : quoted_post_id ? 'quote' : 'original'
  const { data: post, error } = await supabase
    .from('posts')
    .insert({ user_id: profile.id, body: body?.trim() || null, post_type: postType, parent_post_id: parent_post_id || null, quoted_post_id: quoted_post_id || null })
    .select('id').single()
  if (error) return { error: 'Failed to post. Please try again.' }
  if (media_ids?.length) await supabase.from('post_media').update({ post_id: post.id }).in('id', media_ids)
  void supabase.rpc('increment_counter', { p_table: 'users', p_column: 'posts_count', p_id: profile.id, p_amount: 1 })
  if (parent_post_id) {
    void supabase.rpc('increment_counter', { p_table: 'posts', p_column: 'comments_count', p_id: parent_post_id, p_amount: 1 })
    void notifyPostAuthor(supabase, parent_post_id, profile.id, 'post_comment')
  }
  revalidatePath('/feed')
  return { success: true, postId: post.id }
}

export async function deletePostAction(postId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  const { error } = await supabase.from('posts').update({ deleted_at: new Date().toISOString() }).match({ id: postId, user_id: profile.id })
  if (error) return { error: 'Could not delete post.' }
  void supabase.rpc('increment_counter', { p_table: 'users', p_column: 'posts_count', p_id: profile.id, p_amount: -1 })
  revalidatePath('/feed')
  revalidatePath('/profile')
  return { success: true }
}

export async function toggleLikeAction(postId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  const { data: existing } = await supabase.from('likes').select('id').match({ user_id: profile.id, post_id: postId }).maybeSingle()
  if (existing) {
    await supabase.from('likes').delete().match({ user_id: profile.id, post_id: postId })
    void supabase.rpc('increment_counter', { p_table: 'posts', p_column: 'likes_count', p_id: postId, p_amount: -1 })
    return { liked: false }
  }
  await supabase.from('likes').insert({ user_id: profile.id, post_id: postId })
  void supabase.rpc('increment_counter', { p_table: 'posts', p_column: 'likes_count', p_id: postId, p_amount: 1 })
  void notifyPostAuthor(supabase, postId, profile.id, 'post_like')
  return { liked: true }
}

export async function toggleRepostAction(postId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  const { data: existing } = await supabase.from('posts').select('id').match({ user_id: profile.id, post_type: 'repost', parent_post_id: postId }).maybeSingle()
  if (existing) {
    await supabase.from('posts').delete().match({ id: existing.id })
    void supabase.rpc('increment_counter', { p_table: 'posts', p_column: 'reposts_count', p_id: postId, p_amount: -1 })
    return { reposted: false }
  }
  await supabase.from('posts').insert({ user_id: profile.id, post_type: 'repost', parent_post_id: postId })
  void supabase.rpc('increment_counter', { p_table: 'posts', p_column: 'reposts_count', p_id: postId, p_amount: 1 })
  void notifyPostAuthor(supabase, postId, profile.id, 'post_repost')
  return { reposted: true }
}

export async function toggleBookmarkAction(postId: string) {
  const { supabase, profile } = await getCallerProfile()
  if (!profile) return { error: 'Not authenticated' }
  const { data: existing } = await supabase.from('bookmarks').select('id').match({ user_id: profile.id, post_id: postId }).maybeSingle()
  if (existing) {
    await supabase.from('bookmarks').delete().match({ user_id: profile.id, post_id: postId })
    void supabase.rpc('increment_counter', { p_table: 'posts', p_column: 'bookmarks_count', p_id: postId, p_amount: -1 })
    return { bookmarked: false }
  }
  await supabase.from('bookmarks').insert({ user_id: profile.id, post_id: postId })
  void supabase.rpc('increment_counter', { p_table: 'posts', p_column: 'bookmarks_count', p_id: postId, p_amount: 1 })
  return { bookmarked: true }
}

export async function recordImpressionAction(postId: string) {
  const { supabase } = await getCallerProfile()
  void supabase.rpc('increment_counter', { p_table: 'posts', p_column: 'impressions_count', p_id: postId, p_amount: 1 })
}

async function notifyPostAuthor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string, actorId: string,
  type: 'post_like' | 'post_repost' | 'post_comment'
) {
  const { data: post } = await supabase.from('posts').select('user_id').eq('id', postId).single()
  if (!post || post.user_id === actorId) return
  await supabase.from('notifications').insert({ recipient_id: post.user_id, actor_id: actorId, type, entity_id: postId, entity_type: 'post' })
}