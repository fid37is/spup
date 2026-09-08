-- ============================================================
-- 007_monetisation_opt_in.sql
-- Supports the self-serve monetisation opt-in: users must meet
-- growth criteria (90 days / 500 followers / 100 posts) and then
-- explicitly accept before is_monetised is set — see
-- src/lib/actions/monetisation.ts.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS monetised_at TIMESTAMPTZ;
