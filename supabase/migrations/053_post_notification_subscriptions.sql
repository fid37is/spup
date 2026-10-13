-- 053_post_notification_subscriptions.sql
--
-- The bell on a profile ("notify me when this person posts") needs one row per
-- (subscriber, person). Migration 028 tried to create that as
-- `user_notification_preferences`, but this database ALREADY had a table with that name
-- - a different one: a single row per user of notify_* / email_* switches - so
-- `CREATE TABLE IF NOT EXISTS` skipped it, and every bell insert then failed (no
-- target_user_id / type columns), which is why the bell snapped back off on reload.
--
-- The bell now has its own table. The existing `user_notification_preferences` is not
-- touched (nothing in the app reads or writes it).

CREATE TABLE IF NOT EXISTS post_notification_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- who turned the bell on
  target_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- whose posts they want alerts for
  type            TEXT NOT NULL DEFAULT 'post',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, target_user_id, type),
  CHECK (user_id <> target_user_id)
);

-- Fan-out lookup: "who wants a notification when <target> posts?"
CREATE INDEX IF NOT EXISTS idx_pns_target ON post_notification_subscriptions (target_user_id, type);
-- "Who has this person turned the bell on for?" (Priority tab, settings list)
CREATE INDEX IF NOT EXISTS idx_pns_user   ON post_notification_subscriptions (user_id, type, created_at DESC);

ALTER TABLE post_notification_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pns_own" ON post_notification_subscriptions;
CREATE POLICY "pns_own" ON post_notification_subscriptions
  USING      (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

NOTIFY pgrst, 'reload schema';
