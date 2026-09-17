-- 023_scheduled_posts.sql
-- Scheduled posts: a "scheduled" post is a normal row in `posts` whose
-- created_at is set to a future timestamp instead of now(). No cron job or
-- background worker is needed to "publish" it - it simply becomes visible
-- once created_at passes, because every feed/listing query filters on
-- created_at <= now().
--
-- That app-level filter is a query-efficiency choice, not the security
-- boundary. The real boundary is RLS: this migration updates the posts
-- SELECT policy so a not-yet-due post is only readable by its own author
-- (so they can manage it from the Drafts/Scheduled panel) - everyone else's
-- read access is unchanged from the original policy.

DROP POLICY IF EXISTS "posts_public_read" ON posts;

CREATE POLICY "posts_public_read" ON posts
  FOR SELECT USING (
    deleted_at IS NULL AND
    (
      created_at <= now()
      OR user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    ) AND
    EXISTS (
      SELECT 1 FROM users u WHERE u.id = posts.user_id
        AND u.deleted_at IS NULL
        AND u.status != 'banned'
        AND (
          u.is_private = false
          OR u.auth_id = auth.uid()
          OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = (SELECT id FROM users WHERE auth_id = auth.uid()) AND f.following_id = u.id)
        )
    )
  );