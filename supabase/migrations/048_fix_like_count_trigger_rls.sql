-- ============================================================
-- 048_fix_like_count_trigger_rls.sql
--
-- "Post likes are no longer registered - every post shows 0 or 1."
--
-- Root cause: 035 installed trg_sync_like_count, whose function
-- sync_like_count() ends in
--     UPDATE posts SET likes_count = (SELECT COUNT(*) ...) WHERE id = ...
-- but was created as a plain (SECURITY INVOKER) function. It therefore
-- runs with the RLS rights of whoever tapped Like, and the only UPDATE
-- policy on posts is posts_own_update (user_id = the caller). So:
--   - liking your OWN post   -> the UPDATE is allowed  -> count shows 1
--   - liking SOMEONE ELSE'S  -> the UPDATE matches 0 rows, silently,
--     with no error                                     -> count stays 0
-- The row in `likes` is still inserted correctly (likes_own_insert), which
-- is why nothing errored anywhere. Same class of bug already fixed for
-- increment_unread (031) and the follow counters (042).
--
-- Fix:
--   1. Recreate sync_like_count() as SECURITY DEFINER with a pinned
--      search_path, exactly like sync_follow_counts() in 042.
--   2. Recompute every post's likes_count from the real rows in `likes`
--      (same statements as 035 section 1; pure recalculation).
--
-- Safe to run more than once. The existing trigger trg_sync_like_count
-- keeps pointing at this function, so it does not need to be recreated.
-- ============================================================

-- ─── 1. Let the trigger update posts regardless of who liked ─────────────────

CREATE OR REPLACE FUNCTION sync_like_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id UUID := COALESCE(NEW.post_id, OLD.post_id);
BEGIN
  UPDATE posts
  SET likes_count = (SELECT COUNT(*) FROM likes WHERE post_id = v_post_id)
  WHERE id = v_post_id;
  RETURN NULL;
END;
$$;

-- ─── 2. Restore the counts from the real rows ────────────────────────────────

UPDATE posts p
SET likes_count = sub.cnt
FROM (SELECT post_id, COUNT(*) AS cnt FROM likes GROUP BY post_id) sub
WHERE p.id = sub.post_id AND p.likes_count != sub.cnt;

UPDATE posts p
SET likes_count = 0
WHERE p.likes_count != 0
  AND NOT EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id);
