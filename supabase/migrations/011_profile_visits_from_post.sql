-- ============================================================
-- 011_profile_visits_from_post.sql
-- New metric: how many profile visits were attributed to a
-- specific post (clicking the author's avatar/name on that post).
-- ============================================================

ALTER TABLE posts ADD COLUMN IF NOT EXISTS profile_visits_count INTEGER NOT NULL DEFAULT 0 CHECK (profile_visits_count >= 0);
