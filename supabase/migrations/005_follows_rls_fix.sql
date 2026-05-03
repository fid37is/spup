-- src/supabase/migrations/005_follows_rls_fix.sql
-- Ensure follows RLS policies exist and increment_counter is callable.
-- Safe to run multiple times (DROP IF EXISTS before CREATE).

-- increment_counter must be callable by authenticated role
GRANT EXECUTE ON FUNCTION increment_counter(TEXT, TEXT, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_counter(TEXT, TEXT, UUID, INTEGER) TO service_role;

-- Re-confirm follows policies
DROP POLICY IF EXISTS "follows_own_insert" ON follows;
CREATE POLICY "follows_own_insert" ON follows
  FOR INSERT WITH CHECK (
    follower_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "follows_own_delete" ON follows;
CREATE POLICY "follows_own_delete" ON follows
  FOR DELETE USING (
    follower_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Sync follows counts from actual rows (repair any drift)
UPDATE users u SET
  followers_count = (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id),
  following_count = (SELECT COUNT(*) FROM follows f WHERE f.follower_id  = u.id)
WHERE u.deleted_at IS NULL;