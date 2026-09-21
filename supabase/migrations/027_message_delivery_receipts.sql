-- 026_message_delivery_receipts.sql
--
-- Adds the "delivered" step to message ticks (sent -> delivered -> read).
--   delivered_at : set when the recipient's app has received the message
--                  (their messages list or the chat itself was open).
--   read_at      : already exists - set when the chat is actually on screen.
--
-- Safe to run more than once. The app works WITHOUT this migration (it just
-- shows sent -> read); run it to get the double grey tick.
--
-- Note: the messages / conversations / conversation_members tables and the
-- increment_unread() function are not defined in any migration in this repo
-- (they were created directly in Supabase). supabase/diagnostics/chat_health_check.sql
-- has read-only queries to verify them against what the code expects.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- Anything already read has, by definition, been delivered.
UPDATE messages SET delivered_at = read_at
WHERE delivered_at IS NULL AND read_at IS NOT NULL;

-- Thread loads are "this conversation, newest first" - this is the index they need.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, created_at DESC);

-- Receipts are written by the RECIPIENT to rows the SENDER owns, so the UPDATE
-- policy on messages must allow a conversation participant (not only the sender)
-- to update. Check with the diagnostics file before adding anything; if
-- getMessagesAction's old "mark as read" worked for you, this is already fine.
