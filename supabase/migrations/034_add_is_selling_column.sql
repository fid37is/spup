-- ============================================================
-- 034_add_is_selling_column.sql
--
-- The "I'm selling something" composer toggle (is_selling) has
-- been read and written by the app since the selling-posts
-- feature shipped, but the column that backs it was only ever
-- added by hand in the dev database - no migration ever created
-- it. Prod, which is built from migrations only, never got the
-- column, so the selling tag/tab silently fails to work there.
-- This adds it for real, matching how the app already uses it.
-- ============================================================

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS is_selling boolean NOT NULL DEFAULT false;

-- Speeds up the dedicated "Selling" feed tab (WHERE is_selling = true)
-- without bloating the index with the (majority) non-selling rows.
CREATE INDEX IF NOT EXISTS idx_posts_is_selling
  ON posts (created_at DESC)
  WHERE is_selling = true AND deleted_at IS NULL;
