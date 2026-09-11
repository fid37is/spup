-- ============================================================
-- 009_remove_dislikes.sql
-- Removes the dislike feature entirely — decided against
-- keeping it (no major social platform shows dislikes publicly
-- anymore; the risk of coordinated pile-ons/brigading outweighs
-- the signal value, and it measurably discourages posting).
--
-- Guarded with IF EXISTS since these may or may not have made
-- it into a live database depending on whether
-- 008_post_engagement_counts.sql was applied before this ran.
-- ============================================================

DROP TABLE IF EXISTS dislikes CASCADE;

ALTER TABLE posts DROP COLUMN IF EXISTS dislikes_count;
