-- ============================================================
-- 028_reconcile_all_counts.sql
--
-- Fixes two separate problems reported in production:
--
-- 1. "Impressions display nothing, even after many people have
--    viewed/interacted with a post."
--    Root cause: 008_post_engagement_counts.sql created the
--    post_views table but never enabled RLS or added policies
--    for it (every other table in this project explicitly turns
--    RLS on - post_views was the one exception). recordImpressionAction
--    also silently discarded the upsert's error, so if that insert
--    was ever rejected (missing table before 008 was applied, or a
--    permissions problem), it failed on every view with nothing
--    logged anywhere - impressions_count stayed at 0 forever. This
--    migration is safe to run whether or not 008 was ever applied.
--
-- 2. "Followers/following counts get replicated - actual follows
--    and displayed counts don't match."
--    Root cause: toggleFollowAction's unfollow path decremented
--    users.following_count/followers_count unconditionally,
--    without checking whether the DELETE actually removed a row
--    (unlike toggleLikeAction/toggleRepostAction, which already
--    guarded against this). Two overlapping unfollow calls for the
--    same pair could both decrement even though only one row was
--    ever removed, so the stored counters drift below the real
--    number of rows in `follows` over time. The app code is fixed
--    separately in lib/actions/follows.ts; 010_reconcile_engagement_counts.sql
--    reconciled posts.* counts from real rows but never touched
--    users.followers_count/following_count - this migration adds
--    that missing piece.
--
-- Every statement here is idempotent and safe to re-run.
-- ============================================================

-- ─── 1a. Make sure the impression pipeline actually exists ──────────────────
-- (No-ops if 008 already created these.)

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

-- ─── 1b. Secure it - this table had NO RLS at all before this migration ─────
-- A viewer may only ever record their own view. No public SELECT policy is
-- added since the app never reads individual rows from this table - it only
-- ever reads the aggregated posts.impressions_count column.

ALTER TABLE post_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_views_own_insert" ON post_views;
CREATE POLICY "post_views_own_insert" ON post_views
  FOR INSERT WITH CHECK (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "post_views_own_select" ON post_views;
CREATE POLICY "post_views_own_select" ON post_views
  FOR SELECT USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- ─── 2. Reconcile posts.* engagement counts from the real rows ──────────────
-- Safe re-run of 010's logic, in case 010 was never actually applied.

UPDATE posts p
SET comments_count = sub.cnt
FROM (
  SELECT parent_post_id, COUNT(*) AS cnt
  FROM posts
  WHERE parent_post_id IS NOT NULL AND deleted_at IS NULL
  GROUP BY parent_post_id
) sub
WHERE p.id = sub.parent_post_id AND p.comments_count != sub.cnt;

UPDATE posts p
SET comments_count = 0
WHERE p.comments_count != 0
  AND NOT EXISTS (SELECT 1 FROM posts r WHERE r.parent_post_id = p.id AND r.deleted_at IS NULL);

UPDATE posts p
SET quotes_count = sub.cnt
FROM (
  SELECT quoted_post_id, COUNT(*) AS cnt
  FROM posts
  WHERE post_type = 'quote' AND deleted_at IS NULL
  GROUP BY quoted_post_id
) sub
WHERE p.id = sub.quoted_post_id AND p.quotes_count != sub.cnt;

UPDATE posts p
SET quotes_count = 0
WHERE p.quotes_count != 0
  AND NOT EXISTS (SELECT 1 FROM posts q WHERE q.quoted_post_id = p.id AND q.post_type = 'quote' AND q.deleted_at IS NULL);

UPDATE posts p
SET reposts_count = sub.cnt
FROM (
  SELECT quoted_post_id, COUNT(*) AS cnt
  FROM posts
  WHERE post_type = 'repost' AND deleted_at IS NULL
  GROUP BY quoted_post_id
) sub
WHERE p.id = sub.quoted_post_id AND p.reposts_count != sub.cnt;

UPDATE posts p
SET reposts_count = 0
WHERE p.reposts_count != 0
  AND NOT EXISTS (SELECT 1 FROM posts r WHERE r.quoted_post_id = p.id AND r.post_type = 'repost' AND r.deleted_at IS NULL);

UPDATE posts p
SET likes_count = sub.cnt
FROM (SELECT post_id, COUNT(*) AS cnt FROM likes GROUP BY post_id) sub
WHERE p.id = sub.post_id AND p.likes_count != sub.cnt;

UPDATE posts p
SET likes_count = 0
WHERE p.likes_count != 0
  AND NOT EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id);

UPDATE posts p
SET bookmarks_count = sub.cnt
FROM (SELECT post_id, COUNT(*) AS cnt FROM bookmarks GROUP BY post_id) sub
WHERE p.id = sub.post_id AND p.bookmarks_count != sub.cnt;

UPDATE posts p
SET bookmarks_count = 0
WHERE p.bookmarks_count != 0
  AND NOT EXISTS (SELECT 1 FROM bookmarks b WHERE b.post_id = p.id);

-- ─── 3. Reconcile users.followers_count / following_count (NEW) ────────────
-- These were never reconciled before - this is the fix for followers/
-- following counts not matching the actual number of rows in `follows`.

UPDATE users u
SET following_count = sub.cnt
FROM (SELECT follower_id, COUNT(*) AS cnt FROM follows GROUP BY follower_id) sub
WHERE u.id = sub.follower_id AND u.following_count != sub.cnt;

UPDATE users u
SET following_count = 0
WHERE u.following_count != 0
  AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = u.id);

UPDATE users u
SET followers_count = sub.cnt
FROM (SELECT following_id, COUNT(*) AS cnt FROM follows GROUP BY following_id) sub
WHERE u.id = sub.following_id AND u.followers_count != sub.cnt;

UPDATE users u
SET followers_count = 0
WHERE u.followers_count != 0
  AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.following_id = u.id);