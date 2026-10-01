-- 044_chat_hide.sql
--
-- Per-user "Hide chat". Hiding only affects the person who hid it: the other
-- person's copy is untouched and the messages are never deleted. A hidden chat
-- comes back on its own when a new message arrives after hidden_at, and can be
-- unhidden from the "Hidden chats" section of the Messages list.

ALTER TABLE conversation_members
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
