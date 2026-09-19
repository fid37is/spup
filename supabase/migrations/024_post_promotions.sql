-- ============================================================
-- 024_post_promotions_rls_fix.sql
--
-- 023_post_promotions.sql was pasted into the SQL editor as one
-- block and re-run more than once; "relation post_promotions
-- already exists" on a re-run confirms the table itself was
-- created, but doesn't tell us whether every statement after it
-- in that same paste actually completed (indexes, trigger, RLS
-- enable, the three policies) — if the editor ran it as a single
-- transaction and anything failed partway, everything after that
-- point would silently not exist.
--
-- Every statement below is written to be safe to run no matter
-- which of those already exist, so this can just be run once as
-- a catch-all rather than diagnosing exactly where the first run
-- stopped.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_post_promotions_post   ON post_promotions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_promotions_user   ON post_promotions(user_id);
CREATE INDEX IF NOT EXISTS idx_post_promotions_status ON post_promotions(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_promotions_one_live_per_post
  ON post_promotions(post_id)
  WHERE status IN ('pending', 'active');

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_promotions_updated_at ON post_promotions;
CREATE TRIGGER trg_post_promotions_updated_at
  BEFORE UPDATE ON post_promotions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE post_promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_promotions_own_read" ON post_promotions;
CREATE POLICY "post_promotions_own_read" ON post_promotions
  FOR SELECT USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "post_promotions_own_insert" ON post_promotions;
CREATE POLICY "post_promotions_own_insert" ON post_promotions
  FOR INSERT WITH CHECK (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "post_promotions_own_update" ON post_promotions;
CREATE POLICY "post_promotions_own_update" ON post_promotions
  FOR UPDATE USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Quick sanity check you can run right after this, in the same SQL editor:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'post_promotions';
-- You should see exactly three rows: post_promotions_own_read (SELECT),
-- post_promotions_own_insert (INSERT), post_promotions_own_update (UPDATE).