'use server'

/**
 * mentions.ts - user lookup for @mention autosuggest while typing a post,
 * reply, or comment. Read-only, no side effects (notifications for an
 * actual @mention still only fire on publish, via extractMentionedUsernames
 * in lib/utils - this just powers the dropdown while composing).
 */

import { createClient } from '@/lib/supabase/server'
import { sanitizeFilterTerm } from '@/lib/utils'

export interface MentionUser {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  verification_tier: string | null
}

const MAX_RESULTS = 6

export async function searchMentionUsersAction(rawQuery: string): Promise<MentionUser[]> {
  // Same 20-char ceiling as a username itself (see MENTION_RE in lib/utils) -
  // nothing typed past that can ever match a real handle.
  const term = sanitizeFilterTerm(rawQuery, 20)
  if (!term) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, verification_tier')
    .or(`username.ilike.${term}%,display_name.ilike.${term}%`)
    .is('deleted_at', null)
    .neq('status', 'banned')
    .order('followers_count', { ascending: false })
    .limit(MAX_RESULTS)

  return data || []
}