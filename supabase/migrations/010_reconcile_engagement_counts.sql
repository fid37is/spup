-- ============================================================
-- 010_reconcile_engagement_counts.sql
-- One-time fix for counts that drifted before the delete-decrement
-- fix landed (008/009): a reply or quote deleted prior to that fix
-- left the parent's comments_count/quotes_count permanently
-- inflated, since nothing decremented it at the time.
--
-- This recomputes every count directly from the actual rows, so
-- whatever the code did historically, the numbers end up correct
-- right now. Safe to re-run any time — it's a pure recalculation,
-- not an increment/decrement.
-- ============================================================

-- Comments: actual number of non-deleted replies pointing at each post
UPDATE posts p
SET comments_count = sub.cnt
FROM (
  SELECT parent_post_id, COUNT(*) AS cnt
  FROM posts
  WHERE parent_post_id IS NOT NULL AND deleted_at IS NULL
  GROUP BY parent_post_id
) sub
WHERE p.id = sub.parent_post_id AND p.comments_count != sub.cnt;

-- Any post with zero actual replies but a nonzero stored count
UPDATE posts p
SET comments_count = 0
WHERE p.comments_count != 0
  AND NOT EXISTS (
    SELECT 1 FROM posts r WHERE r.parent_post_id = p.id AND r.deleted_at IS NULL
  );

-- Quotes: actual number of non-deleted quote posts pointing at each post
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
  AND NOT EXISTS (
    SELECT 1 FROM posts q WHERE q.quoted_post_id = p.id AND q.post_type = 'quote' AND q.deleted_at IS NULL
  );

-- Reposts: actual number of non-deleted reposts pointing at each post
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
  AND NOT EXISTS (
    SELECT 1 FROM posts r WHERE r.quoted_post_id = p.id AND r.post_type = 'repost' AND r.deleted_at IS NULL
  );

-- Likes: actual row count in the likes table
UPDATE posts p
SET likes_count = sub.cnt
FROM (
  SELECT post_id, COUNT(*) AS cnt FROM likes GROUP BY post_id
) sub
WHERE p.id = sub.post_id AND p.likes_count != sub.cnt;

UPDATE posts p
SET likes_count = 0
WHERE p.likes_count != 0
  AND NOT EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id);

-- Bookmarks: actual row count in the bookmarks table
UPDATE posts p
SET bookmarks_count = sub.cnt
FROM (
  SELECT post_id, COUNT(*) AS cnt FROM bookmarks GROUP BY post_id
) sub
WHERE p.id = sub.post_id AND p.bookmarks_count != sub.cnt;

UPDATE posts p
SET bookmarks_count = 0
WHERE p.bookmarks_count != 0
  AND NOT EXISTS (SELECT 1 FROM bookmarks b WHERE b.post_id = p.id);

-- Enforce: only one pinned post per user, in case any account currently
-- has more than one is_pinned=true row from before togglePinPostAction's
-- single-pin enforcement existed.
UPDATE posts p
SET is_pinned = false
WHERE is_pinned = true
  AND id NOT IN (
    SELECT DISTINCT ON (user_id) id
    FROM posts
    WHERE is_pinned = true AND deleted_at IS NULL
    ORDER BY user_id, created_at DESC
  );
