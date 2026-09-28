-- ============================================================
-- 036_feed_catch_up.sql
--
-- Powers the feed's "While you were away" catch-up module.
--
-- The feed is newest-first, so someone who has been away for a
-- while lands on the latest 20 posts and everything they missed
-- in between sits far below the fold. This table remembers, per
-- user, when they were last actively on the feed and which
-- "away since" point a pending catch-up is anchored to, so the
-- server can surface the best posts from that window at the top.
--
--   last_seen_at   heartbeat while the feed is open and visible
--   catchup_since  "away since" anchor for a pending catch-up;
--                  NULL once dismissed / nothing to show
--
-- RLS is enabled with NO policies on purpose: the table is only
-- ever read/written by server actions using the service role
-- (same approach as other server-owned state), so the anon /
-- authenticated clients can't touch it at all.
--
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_feed_state (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  catchup_since  TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_feed_state ENABLE ROW LEVEL SECURITY;
