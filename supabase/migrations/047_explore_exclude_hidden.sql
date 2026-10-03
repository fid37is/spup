-- Explore topic tabs must not show posts from people the viewer blocked or muted.
-- Adds p_exclude (author ids to skip) to explore_topic_post_ids from 045.
-- Safe to re-run; also safe if 045 was never applied (it only needs posts/hashtags).

DROP FUNCTION IF EXISTS explore_topic_post_ids(TEXT[], TEXT, INT, INT);

CREATE OR REPLACE FUNCTION explore_topic_post_ids(
  p_tags    TEXT[],
  p_pattern TEXT,
  p_days    INT DEFAULT 30,
  p_limit   INT DEFAULT 30,
  p_exclude UUID[] DEFAULT '{}'
)
RETURNS TABLE (id UUID)
LANGUAGE sql STABLE AS $$
  SELECT p.id
  FROM posts p
  WHERE p.deleted_at IS NULL
    AND p.parent_post_id IS NULL
    AND p.post_type IN ('original', 'quote')
    AND p.created_at <= NOW()
    AND p.created_at >= NOW() - make_interval(days => LEAST(GREATEST(p_days, 1), 365))
    AND NOT (p.user_id = ANY (COALESCE(p_exclude, '{}')))
    AND (
      EXISTS (
        SELECT 1
        FROM post_hashtags ph
        JOIN hashtags h ON h.id = ph.hashtag_id
        WHERE ph.post_id = p.id AND h.tag = ANY (p_tags)
      )
      OR (COALESCE(p_pattern, '') <> '' AND p.body ~* p_pattern)
    )
  ORDER BY p.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

GRANT EXECUTE ON FUNCTION explore_topic_post_ids(TEXT[], TEXT, INT, INT, UUID[]) TO anon, authenticated;
