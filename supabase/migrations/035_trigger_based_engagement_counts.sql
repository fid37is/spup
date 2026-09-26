-- ============================================================
-- 034_trigger_based_engagement_counts.sql
--
-- Root cause of "1 like/comment shows as 2, 1 repost shows as 3":
-- likes_count / comments_count / quotes_count / reposts_count on
-- `posts` have been maintained as manually-bumped counters, written
-- by a separate app-level RPC call after each insert/delete. That's
-- the third time this exact class of bug has needed a migration to
-- fix (008 -> 009 -> 010 -> 029) because a bumped counter can only
-- ever be as correct as the last reconciliation - any retry, races
-- across two requests, or a code path someone forgets to update the
-- next time a new interaction type is added, and it drifts again,
-- silently, with no way to tell it's wrong without re-counting the
-- real rows.
--
-- This migration removes that whole class of bug instead of
-- patching this instance of it:
--   1. Reconciles every post's counts from the real rows, right now
--      (safe to re-run; pure recalculation).
--   2. Installs triggers on `likes` and `posts` that recompute the
--      affected post's counts directly from the real rows, in the
--      same transaction as the write that changed them. From this
--      point on, likes_count/comments_count/quotes_count/reposts_count
--      are never written by app code - only by these triggers - so
--      there is exactly one source of truth and no path left by
--      which they can drift from what's actually in the tables.
--
-- The corresponding app-code changes (removing the now-redundant
-- manual bumpCounter/increment_counter calls for these four columns)
-- ship in src/lib/actions/posts.ts alongside this migration. Deploy
-- both together - the old code still works fine against the new
-- triggers (it just does one redundant no-op-safe write), but there's
-- no reason to keep the dead code once this is applied.
-- ============================================================

-- ─── 1. Fix the current drift for all existing posts ─────────────────────────

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

-- ─── 2. likes -> posts.likes_count ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_like_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_post_id UUID := COALESCE(NEW.post_id, OLD.post_id);
BEGIN
  UPDATE posts
  SET likes_count = (SELECT COUNT(*) FROM likes WHERE post_id = v_post_id)
  WHERE id = v_post_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_like_count ON likes;
CREATE TRIGGER trg_sync_like_count
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW EXECUTE FUNCTION sync_like_count();

-- ─── 3. posts -> parent's comments_count / quoted's quotes_count|reposts_count ─
-- A reply sets parent_post_id; a quote or a repost sets quoted_post_id (the
-- post_type distinguishes which counter it feeds). Fires on INSERT (new
-- reply/quote/repost appears), on UPDATE of deleted_at (soft delete or, in
-- principle, a future restore), and on DELETE (a hard delete, e.g. a
-- cancelled-before-published scheduled reply - createPostAction bumps
-- posts_count immediately, so a hard delete here needs the same recompute
-- a soft delete gets).

CREATE OR REPLACE FUNCTION recompute_post_child_counts(p_post_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_post_id IS NULL THEN RETURN; END IF;
  UPDATE posts SET
    comments_count = (SELECT COUNT(*) FROM posts WHERE parent_post_id = p_post_id AND deleted_at IS NULL),
    quotes_count   = (SELECT COUNT(*) FROM posts WHERE quoted_post_id = p_post_id AND post_type = 'quote'  AND deleted_at IS NULL),
    reposts_count  = (SELECT COUNT(*) FROM posts WHERE quoted_post_id = p_post_id AND post_type = 'repost' AND deleted_at IS NULL)
  WHERE id = p_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION sync_post_engagement_counts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM recompute_post_child_counts(NEW.parent_post_id);
    PERFORM recompute_post_child_counts(NEW.quoted_post_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      PERFORM recompute_post_child_counts(NEW.parent_post_id);
      PERFORM recompute_post_child_counts(NEW.quoted_post_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM recompute_post_child_counts(OLD.parent_post_id);
    PERFORM recompute_post_child_counts(OLD.quoted_post_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_post_engagement ON posts;
CREATE TRIGGER trg_sync_post_engagement
  AFTER INSERT OR DELETE OR UPDATE OF deleted_at ON posts
  FOR EACH ROW EXECUTE FUNCTION sync_post_engagement_counts();