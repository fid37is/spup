-- ============================================================
-- 042_trigger_based_follow_counts.sql
--
-- users.followers_count / following_count were maintained by app code
-- (bumpCounter -> increment_counter after each follow/unfollow/block).
-- Same failure class already fixed for posts in 035: a bumped counter is
-- only as right as the last reconciliation, so it drifts again (retries,
-- races, an edge path nobody updated) - profile showed 213 followers while
-- the Followers list, which reads the real rows, showed 112.
--
-- This migration:
--   1. Reconciles every user's counts from the real `follows` rows now.
--   2. Installs a trigger on `follows` that recomputes the two affected
--      users' counts from the rows, in the same transaction as the write.
-- From here on, app code must NOT write followers_count/following_count
-- (the matching change in src/lib/actions/follows.ts removes those calls).
-- Safe to re-run.
-- ============================================================

-- 1. Reconcile everyone
UPDATE users u
SET followers_count = COALESCE(s.cnt, 0)
FROM users u2
LEFT JOIN (SELECT following_id AS id, COUNT(*)::int AS cnt FROM follows GROUP BY following_id) s ON s.id = u2.id
WHERE u.id = u2.id AND u.followers_count IS DISTINCT FROM COALESCE(s.cnt, 0);

UPDATE users u
SET following_count = COALESCE(s.cnt, 0)
FROM users u2
LEFT JOIN (SELECT follower_id AS id, COUNT(*)::int AS cnt FROM follows GROUP BY follower_id) s ON s.id = u2.id
WHERE u.id = u2.id AND u.following_count IS DISTINCT FROM COALESCE(s.cnt, 0);

-- 2. Trigger
CREATE OR REPLACE FUNCTION sync_follow_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_follower  UUID := COALESCE(NEW.follower_id,  OLD.follower_id);
  v_following UUID := COALESCE(NEW.following_id, OLD.following_id);
BEGIN
  UPDATE users
  SET following_count = (SELECT COUNT(*) FROM follows WHERE follower_id = v_follower)
  WHERE id = v_follower;

  UPDATE users
  SET followers_count = (SELECT COUNT(*) FROM follows WHERE following_id = v_following)
  WHERE id = v_following;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_follow_counts ON follows;
CREATE TRIGGER trg_sync_follow_counts
AFTER INSERT OR DELETE ON follows
FOR EACH ROW EXECUTE FUNCTION sync_follow_counts();