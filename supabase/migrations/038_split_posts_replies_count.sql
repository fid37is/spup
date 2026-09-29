-- 037_split_posts_replies_count.sql
--
-- users.posts_count has always been bumped on every post insert -
-- original posts, quotes, replies, and reposts alike (see createPostAction
-- in lib/actions/posts.ts) - and every UI that reads it (profile header,
-- admin dashboard "Total posts", admin users list, monetisation
-- eligibility) treated the result as "how many posts has this person made".
-- A user with 2 real posts and 50 replies to other people's posts showed
-- up everywhere as having 52 posts.
--
-- This was already inconsistent with the profile's own "Posts" tab query
-- (getProfileTabAction, tab === 'posts'), which has always filtered to
-- parent_post_id IS NULL AND post_type != 'repost' - so the header stat and
-- the tab beneath it never actually matched. That existing tab filter is
-- the real, load-bearing definition of "a post" in this app; this migration
-- makes posts_count match it, and adds a separate replies_count for the
-- comments/replies that were previously conflated into it. Reposts aren't
-- counted in either bucket, matching that same tab filter - resharing isn't
-- original content, and it already didn't show up in the Posts tab.
--
-- App-side: lib/actions/posts.ts now branches on parent_post_id/post_type
-- when bumping these on create/delete/cancel-scheduled, instead of always
-- bumping posts_count. This migration adds the column and reconciles
-- existing rows so both counts are accurate the moment it lands - not just
-- for posts made after.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS replies_count INTEGER NOT NULL DEFAULT 0 CHECK (replies_count >= 0);

-- Reconcile every user's posts_count/replies_count from the real rows.
-- Scoped the same way every feed/profile query already scopes "does this
-- post count": not soft-deleted, and not a still-scheduled post whose
-- created_at hasn't arrived yet.
WITH counts AS (
  SELECT
    user_id,
    COUNT(*) FILTER (
      WHERE parent_post_id IS NULL AND post_type != 'repost'
    ) AS posts_cnt,
    COUNT(*) FILTER (
      WHERE parent_post_id IS NOT NULL
    ) AS replies_cnt
  FROM posts
  WHERE deleted_at IS NULL
    AND created_at <= now()
  GROUP BY user_id
)
UPDATE users u
SET
  posts_count   = COALESCE(c.posts_cnt, 0),
  replies_count = COALESCE(c.replies_cnt, 0)
FROM counts c
WHERE u.id = c.user_id;

-- Users with zero qualifying posts/replies never appear in `counts` above
-- (the join above only touches rows that DO have a match) - zero them out
-- explicitly rather than leaving a stale posts_count (e.g. from old
-- all-inclusive bumps on posts that have since been deleted).
UPDATE users
SET posts_count = 0, replies_count = 0
WHERE id NOT IN (SELECT DISTINCT user_id FROM posts WHERE deleted_at IS NULL AND created_at <= now());