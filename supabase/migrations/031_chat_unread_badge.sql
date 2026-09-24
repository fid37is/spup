-- ============================================================
-- 029_fix_chat_unread_badge.sql
--
-- "The message icon still doesn't display new message count on
-- the bottom nav."
--
-- Root cause: sendMessageAction calls the RPC increment_unread(),
-- which needs to write to the RECIPIENT's row in
-- conversation_members - but it's called under the SENDER's
-- session. conversation_members almost certainly has the same
-- "only touch your own row" RLS policy every other per-user table
-- in this project has (see 001_initial_schema.sql for the pattern -
-- users_own_update, likes_own_delete, etc). A plain SQL function
-- runs as SECURITY INVOKER by default, i.e. with the CALLER's RLS
-- restrictions - so the sender's call silently fails to update a
-- row they don't own. No error surfaces (Postgres doesn't error on
-- an UPDATE that matches 0 rows), sendMessageAction's own error
-- logging never fires, and unread_count for the recipient never
-- moves off whatever it already was - which, for a brand new
-- conversation, is 0. This is the same class of bug as the
-- impressions/post_views issue fixed in 028: a cross-user write
-- silently blocked by RLS with nothing surfacing it.
--
-- This tables/function pair (conversation_members, increment_unread)
-- is not defined in any migration in this repo - it was created
-- directly against the live database (see the note in
-- 026_message_delivery_receipts.sql). This migration only touches
-- what the app code demonstrably depends on: the RPC's behaviour,
-- the column it writes to, and realtime delivery - it does not
-- attempt to recreate the underlying tables blind.
--
-- Safe to run more than once.
-- ============================================================

-- Defensive: make sure the column the whole unread system depends on
-- actually exists with the shape the app expects. No-ops if it's already
-- there and correct.
ALTER TABLE conversation_members
  ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0);

-- The fix: SECURITY DEFINER makes this function run with the privileges of
-- whoever owns it (not the caller), so it can write to a row the caller
-- doesn't have direct UPDATE access to - which is exactly what "sender
-- increments the recipient's unread count" requires. search_path is pinned
-- per Postgres's own guidance for SECURITY DEFINER functions, to prevent a
-- malicious search_path from redirecting `conversation_members` elsewhere.
--
-- Same signature the app already calls (p_conversation_id, p_sender_id) -
-- CREATE OR REPLACE only replaces a function with an identical signature,
-- so this fixes the existing function's body without risking a duplicate
-- overload.
CREATE OR REPLACE FUNCTION increment_unread(p_conversation_id UUID, p_sender_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE conversation_members
  SET unread_count = unread_count + 1
  WHERE conversation_id = p_conversation_id
    AND user_id != p_sender_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_unread(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_unread(UUID, UUID) TO service_role;

-- Realtime: useChatUnread's live "+1 the moment a message arrives" behaviour
-- (src/hooks/use-chat-unread.ts) subscribes to postgres_changes INSERT on
-- `messages`. If this table was never added to the supabase_realtime
-- publication (plausible, given it was created outside any migration), that
-- subscription just never fires - the badge would still eventually catch up
-- via the 45s poll / route-change re-check, but "still doesn't display"
-- suggests it isn't catching up at all, which points at increment_unread
-- above rather than this - added regardless since it's required either way
-- for the instant update to work, and is safe/idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
END $$;

-- One-time backfill: recompute every unread_count from the actual messages
-- that are unread (sent by someone else, not yet read) right now, so
-- whatever drifted while increment_unread was silently failing gets
-- corrected immediately rather than waiting for new messages.
UPDATE conversation_members cm
SET unread_count = sub.cnt
FROM (
  SELECT m.conversation_id, cm2.user_id, COUNT(*) AS cnt
  FROM messages m
  JOIN conversation_members cm2 ON cm2.conversation_id = m.conversation_id AND cm2.user_id != m.sender_id
  WHERE m.read_at IS NULL AND m.is_deleted IS NOT TRUE
  GROUP BY m.conversation_id, cm2.user_id
) sub
WHERE cm.conversation_id = sub.conversation_id AND cm.user_id = sub.user_id AND cm.unread_count != sub.cnt;

UPDATE conversation_members cm
SET unread_count = 0
WHERE cm.unread_count != 0
  AND NOT EXISTS (
    SELECT 1 FROM messages m
    WHERE m.conversation_id = cm.conversation_id AND m.sender_id != cm.user_id
      AND m.read_at IS NULL AND m.is_deleted IS NOT TRUE
  );