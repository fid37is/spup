'use server'

/**
 * reports.ts - user-submitted reports (posts, replies, profiles).
 * Replies are posts, so reporting a reply is entity_type 'post'.
 * Review happens in the admin panel (Trust & safety -> Reports).
 */

import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { reportSchema } from '@/lib/validations/schemas'

export type SubmitReportResult =
  | { success: true; duplicate?: boolean }
  | { error: string }

export async function submitReportAction(input: {
  entity_id: string
  entity_type: 'post' | 'user' | 'comment'
  reason: 'spam' | 'harassment' | 'hate_speech' | 'misinformation' | 'nudity' | 'violence' | 'other'
  details?: string
}): Promise<SubmitReportResult> {
  const parsed = reportSchema.safeParse({
    ...input,
    details: input.details?.trim() || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Please choose a reason.' }
  const { entity_id, entity_type, reason, details } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please log in to report.' }

  const { data: me } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
  if (!me) return { error: 'Please log in to report.' }

  // Stops report-spamming a person or flooding the moderators' queue.
  if (!(await checkRateLimit(`report:${me.id}`, 20, 60 * 60))) {
    return { error: 'You are reporting too quickly. Please try again later.' }
  }

  // Make sure the target is real and isn't the reporter's own.
  if (entity_type === 'user') {
    if (entity_id === me.id) return { error: "You can't report yourself." }
    const { data: target } = await supabase.from('users').select('id').eq('id', entity_id).maybeSingle()
    if (!target) return { error: 'This account is no longer available.' }
  } else {
    const { data: target } = await supabase
      .from('posts').select('id, user_id').eq('id', entity_id).is('deleted_at', null).maybeSingle()
    if (!target) return { error: 'This post is no longer available.' }
    if (target.user_id === me.id) return { error: "You can't report your own post." }
  }

  const { error } = await supabase.from('reports').insert({
    reporter_id: me.id,
    entity_id,
    entity_type,
    reason,
    details: details ?? null,
  })

  if (error) {
    // Unique index: this person already has a pending report on this thing.
    if (error.code === '23505') return { success: true, duplicate: true }
    console.error('[submitReportAction] insert failed:', error.message)
    return { error: 'Could not submit your report. Please try again.' }
  }

  return { success: true }
}
