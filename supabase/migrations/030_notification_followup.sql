-- 029_notification_followups.sql
--
--   1. 'wallet_transfer_received' notification type. wallet-transfer.ts was
--      already inserting it, but no migration ever added it to the enum.
--   2. pending_post_notifications: a to-do list for SCHEDULED posts, so
--      their @mentions and "new post" alerts go out when the post goes live
--      (see /api/cron/scheduled-post-notifications).
--   3. Message notifications no longer live in the notifications table
--      (they only show on the Messages icon), so clear out the old ones.

-- 1 ─────────────────────────────────────────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'wallet_transfer_received';

-- 2 ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_post_notifications (
  post_id    UUID PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only the server (service role) reads/writes this; no policies = no client access.
ALTER TABLE pending_post_notifications ENABLE ROW LEVEL SECURITY;

-- 3 ─────────────────────────────────────────────────────────────────────────
-- (Message text is encrypted; these rows only ever said "X sent you a message".)
DELETE FROM notifications WHERE type = 'new_message';

NOTIFY pgrst, 'reload schema';
