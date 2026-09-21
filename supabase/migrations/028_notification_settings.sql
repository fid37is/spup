-- 028_notification_settings.sql
--
-- Backs the redesigned notifications page (X-style) and its settings:
--   1. 'new_post' notification type  -> "New post from X" for people whose
--      post notifications the viewer turned on (bell on their profile).
--   2. user_notification_preferences -> the table togglePostNotificationsAction
--      already writes to. It was referenced by the app but never created in a
--      migration, so it is created here IF it does not already exist.
--   3. notification_settings         -> per-user Filters + Preferences.
--   4. users.notif_push / notif_email -> already read/written by the app;
--      added defensively so a fresh database has them.

-- ── 1. new notification type ────────────────────────────────────────────────
-- NOTE: a new enum value can't be used in the same transaction that adds it.
-- Nothing in this file uses it, so this is safe to run as one script.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_post';

-- ── 2. post-notification subscriptions (the "bell" on a profile) ────────────
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL DEFAULT 'post',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, target_user_id, type),
  CHECK (user_id <> target_user_id)
);

-- Fan-out lookup: "who wants a notification when <target> posts?"
CREATE INDEX IF NOT EXISTS idx_unp_target
  ON user_notification_preferences (target_user_id, type);
CREATE INDEX IF NOT EXISTS idx_unp_user
  ON user_notification_preferences (user_id, type);

ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unp_own" ON user_notification_preferences;
CREATE POLICY "unp_own" ON user_notification_preferences
  USING      (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── 3. per-user settings ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Filters: silence notifications from ... (all off by default)
  filter_not_following      BOOLEAN NOT NULL DEFAULT false,  -- people you don't follow
  filter_not_following_you  BOOLEAN NOT NULL DEFAULT false,  -- people who don't follow you
  filter_new_accounts       BOOLEAN NOT NULL DEFAULT false,  -- accounts < 30 days old
  filter_default_avatar     BOOLEAN NOT NULL DEFAULT false,  -- accounts with no profile photo

  -- Preferences: what you want to be notified about (all on by default)
  pref_replies   BOOLEAN NOT NULL DEFAULT true,
  pref_mentions  BOOLEAN NOT NULL DEFAULT true,
  pref_likes     BOOLEAN NOT NULL DEFAULT true,
  pref_reposts   BOOLEAN NOT NULL DEFAULT true,   -- reposts + quotes
  pref_follows   BOOLEAN NOT NULL DEFAULT true,
  pref_messages  BOOLEAN NOT NULL DEFAULT true,
  pref_posts     BOOLEAN NOT NULL DEFAULT true,   -- new posts from people you turned the bell on for
  pref_wallet    BOOLEAN NOT NULL DEFAULT true,   -- tips, escrow/orders, earnings

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notification_settings_own" ON notification_settings;
CREATE POLICY "notification_settings_own" ON notification_settings
  USING      (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── 4. master push / email switches (already used by the app) ───────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notif_push  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_email BOOLEAN NOT NULL DEFAULT true;

-- ── 5. faster notification tabs ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_type
  ON notifications (recipient_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_actor
  ON notifications (recipient_id, actor_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
