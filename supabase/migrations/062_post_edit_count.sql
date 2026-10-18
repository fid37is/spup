-- 062_post_edit_count.sql
-- Counts how many times a post's text has been edited, so editPostAction can
-- enforce the 5-edit limit. edited_at already exists (001) and drives the
-- "edited" label on the card; it just was never written until now.

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS edit_count SMALLINT NOT NULL DEFAULT 0;
