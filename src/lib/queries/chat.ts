import { createClient } from '@/lib/supabase/server'

/**
 * Total unread chat messages for the Chat tab badge (mobile bottom nav + sidebar).
 *
 * Counts the actual unread messages - sent by someone else, not read yet, not
 * deleted - rather than summing conversation_members.unread_count. That stored
 * counter is bumped by the increment_unread() database function, and when the
 * function or the recipient's conversation_members row is missing/blocked the
 * counter stays at 0 with no error, so the badge never showed anything. Counting
 * messages needs neither, and it can't drift. RLS already limits `messages` to
 * conversations the caller is part of.
 * (Kept in lib/queries/chat.ts, separate from the 'use server' actions file, so
 * the layout can call it during render.)
 */
export async function getUnreadChatCount(userId: string): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .neq('sender_id', userId)
    .is('read_at', null)
    .eq('is_deleted', false)

  if (error) {
    console.error('[getUnreadChatCount] failed:', error.message)
    return 0
  }
  return count || 0
}