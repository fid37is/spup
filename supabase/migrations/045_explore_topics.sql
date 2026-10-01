-- Explore tabs: topic matching by hashtag OR wording, plus hashtag repairs.
-- Safe to re-run.

-- 1) Posts for an Explore topic -----------------------------------------------
-- Matches a post when it carries one of p_tags OR its text matches p_pattern
-- (case-insensitive regex, built from src/lib/explore-topics.ts - never from
-- user input). Real top-level posts only, newest first, nothing scheduled for
-- the future. SECURITY INVOKER: normal post visibility rules still apply.
CREATE OR REPLACE FUNCTION explore_topic_post_ids(
  p_tags    TEXT[],
  p_pattern TEXT,
  p_days    INT DEFAULT 30,
  p_limit   INT DEFAULT 30
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

GRANT EXECUTE ON FUNCTION explore_topic_post_ids(TEXT[], TEXT, INT, INT) TO anon, authenticated;

-- 2) Hashtag counts that stay correct ------------------------------------------
-- The old function created a tag with posts_count 0 (so the first use showed
-- "0 posts"), added +1 on every conflict, and never subtracted when a post was
-- edited. Now the count is always recomputed from the real rows.
CREATE OR REPLACE FUNCTION process_post_hashtags(p_post_id UUID, p_body TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tag        TEXT;
  v_hashtag_id UUID;
  v_touched    UUID[] := '{}';
BEGIN
  SELECT COALESCE(array_agg(hashtag_id), '{}') INTO v_touched
  FROM post_hashtags WHERE post_id = p_post_id;

  DELETE FROM post_hashtags WHERE post_id = p_post_id;

  FOR v_tag IN
    SELECT DISTINCT lower(m[1])
    FROM regexp_matches(COALESCE(p_body, ''), '#([A-Za-z0-9_]+)', 'g') AS m
  LOOP
    INSERT INTO hashtags (tag) VALUES (v_tag)
    ON CONFLICT (tag) DO UPDATE SET tag = EXCLUDED.tag
    RETURNING id INTO v_hashtag_id;

    INSERT INTO post_hashtags (post_id, hashtag_id) VALUES (p_post_id, v_hashtag_id)
    ON CONFLICT DO NOTHING;

    v_touched := v_touched || v_hashtag_id;
  END LOOP;

  UPDATE hashtags h
     SET posts_count = (
       SELECT count(*) FROM post_hashtags ph
       JOIN posts p ON p.id = ph.post_id AND p.deleted_at IS NULL
       WHERE ph.hashtag_id = h.id
     )
   WHERE h.id = ANY (v_touched);
END;
$$;

-- 3) Backfill: link every existing post that has #hashtags in its text ----------
INSERT INTO hashtags (tag)
SELECT DISTINCT lower(m[1])
FROM posts p
CROSS JOIN LATERAL regexp_matches(p.body, '#([A-Za-z0-9_]+)', 'g') AS m
WHERE p.deleted_at IS NULL AND p.body IS NOT NULL
ON CONFLICT (tag) DO NOTHING;

INSERT INTO post_hashtags (post_id, hashtag_id)
SELECT DISTINCT p.id, h.id
FROM posts p
CROSS JOIN LATERAL regexp_matches(p.body, '#([A-Za-z0-9_]+)', 'g') AS m
JOIN hashtags h ON h.tag = lower(m[1])
WHERE p.deleted_at IS NULL AND p.body IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE hashtags h
   SET posts_count = (
     SELECT count(*) FROM post_hashtags ph
     JOIN posts p ON p.id = ph.post_id AND p.deleted_at IS NULL
     WHERE ph.hashtag_id = h.id
   );
