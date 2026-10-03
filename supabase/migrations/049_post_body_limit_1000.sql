-- ============================================================
-- 049_post_body_limit_1000.sql
--
-- Posts (and quotes) may now be up to 1,000 characters. Replies
-- stay at 500. Replies are rows in `posts` with parent_post_id
-- set, so the one CHECK constraint on posts.body has to know the
-- difference. The app enforces the same split in
-- src/lib/validations/schemas.ts and the composers.
--
-- Every existing row is already <= 500, so adding the new
-- constraint cannot fail on current data. NULL bodies (reposts)
-- pass, as before. Safe to run more than once.
-- ============================================================

ALTER TABLE posts DROP CONSTRAINT IF EXISTS body_length;

ALTER TABLE posts ADD CONSTRAINT body_length CHECK (
  char_length(body) <= CASE WHEN parent_post_id IS NULL THEN 1000 ELSE 500 END
);
