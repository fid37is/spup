import { createClient } from '@/lib/supabase/server'

/**
 * Total unread chat messages for the Chat tab badge.
 *
 * Sums conversation_members.unread_count - the same number the messages list
 * shows per conversation - so the badge and the list can never disagree.
 * (Kept in lib/queries/chat.ts, separate from the 'use server' actions file, so
 * the layout can call it during render.)
 */
export async function getUnreadChatCount(userId: string): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('conversation_members')
    .select('unread_count')
    .eq('user_id', userId)

  if (error) {
    console.error('[getUnreadChatCount] failed:', error.message)
    return 0
  }
  return (data ?? []).reduce((sum: number, r: { unread_count: number | null }) => sum + (r.unread_count || 0), 0)
}
