-- ============================================================
-- 008_post_engagement_counts.sql
-- Fixes counts/impressions that were never actually being
-- captured — several tables/columns the app code depends on
-- (posts.ts, getPostAnalyticsAction) don't exist in any
-- committed migration:
--   - post_views table (impressions) + the trigger that was
--     supposed to increment posts.impressions_count from it
--   - dislikes table
--   - posts.dislikes_count, link_clicks_count,
--     detail_expands_count, video_views_count,
--     video_completions_count
-- All guarded with IF NOT EXISTS in case any of these already
-- exist live and were simply never committed (same drift issue
-- as the ads/* tables found earlier).
-- ============================================================

-- ─── Missing posts columns ──────────────────────────────────────────────────

ALTER TABLE posts ADD COLUMN IF NOT EXISTS link_clicks_count       INTEGER NOT NULL DEFAULT 0 CHECK (link_clicks_count >= 0);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS detail_expands_count    INTEGER NOT NULL DEFAULT 0 CHECK (detail_expands_count >= 0);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_views_count       INTEGER NOT NULL DEFAULT 0 CHECK (video_views_count >= 0);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_completions_count INTEGER NOT NULL DEFAULT 0 CHECK (video_completions_count >= 0);

-- Note: dislikes_count / a dislikes table are deliberately NOT added here —
-- the dislike feature was removed as a product decision. See
-- 009_remove_dislikes.sql for the cleanup if this migration was already
-- applied with an earlier version that included them.


-- ─── Notification type for quote posts ───────────────────────────────────────
-- Quote posts were previously falling back to reusing 'post_comment' (or
-- not notifying at all) — give them their own type.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'post_quote';


-- ─── Impressions: post_views table + trigger ─────────────────────────────────
-- One row per (post, user) — recordImpressionAction upserts here with
-- ignoreDuplicates, so each viewer only ever counts once per post. The
-- trigger is what actually turns a new row into a bump on
-- posts.impressions_count; without it (the previous state) impressions were
-- never incremented at all, regardless of how many times the action ran.

CREATE TABLE IF NOT EXISTS post_views (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_views_post ON post_views (post_id);

CREATE OR REPLACE FUNCTION bump_post_impressions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE posts SET impressions_count = impressions_count + 1 WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_post_impressions ON post_views;
CREATE TRIGGER trg_bump_post_impressions
  AFTER INSERT ON post_views
  FOR EACH ROW EXECUTE FUNCTION bump_post_impressions();


-- ─── Backfill note ────────────────────────────────────────────────────────────
-- This migration does not attempt to backfill impressions_count from
-- historical data, since no impressions were ever actually recorded before
-- this fix (the table didn't exist) — there's nothing to backfill from.
-- likes_count/comments_count/reposts_count should already be numerically
-- correct going forward since those code paths were already working; only
-- quotes_count needs a one-time backfill, since it was never incremented:

UPDATE posts p
SET quotes_count = sub.cnt
FROM (
  SELECT quoted_post_id, COUNT(*) AS cnt
  FROM posts
  WHERE post_type = 'quote' AND deleted_at IS NULL
  GROUP BY quoted_post_id
) sub
WHERE p.id = sub.quoted_post_id
  AND p.quotes_count != sub.cnt;
