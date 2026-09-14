-- ============================================================
-- 016_pioneer_status_backfill.sql
--
-- Must run as its own migration, after 015 commits — see the note
-- at the bottom of 015_pioneer_status.sql for why this can't live
-- in the same file as the ALTER TYPE that added 'pioneer'.
-- ============================================================

UPDATE users
   SET verification_tier = 'pioneer'
 WHERE verification_tier = 'standard'
   AND is_pioneer = true;
