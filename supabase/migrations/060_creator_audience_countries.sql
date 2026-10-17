-- ============================================================
-- 060_creator_audience_countries.sql
--
-- The analytics audience now shows EVERY country the viewers are in, not only
-- Nigerian states. Spup already records each person's country (ISO code) when
-- they sign up and when they are next seen (user_analytics), so a new market -
-- Ghana, the Netherlands, any African country - appears in the creator's
-- analytics as soon as people from there start viewing posts.
--
-- Replaces creator_audience_stats (same name and arguments as 058/059); it adds
--   countries       top 8 countries by viewers  [{code, count}]
--   country_sample  viewers whose country is known (the 100% for the list)
-- and keeps `states` (the Nigerian states, from viewers located in Nigeria).
--
-- COUNTS ONLY - nothing says who a viewer is.
-- Run after 058 and 059.
-- ============================================================

CREATE OR REPLACE FUNCTION creator_audience_stats(p_user_id UUID, p_since TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  WITH v AS (
    SELECT pv.user_id AS viewer_id, pv.created_at
      FROM post_views pv
      JOIN posts p ON p.id = pv.post_id
     WHERE p.user_id = p_user_id
       AND p.deleted_at IS NULL
       AND p.post_type <> 'repost'
       AND pv.user_id <> p_user_id
       AND pv.created_at >= p_since          -- the VIEW happened in the window
  ),
  viewers AS (
    SELECT DISTINCT viewer_id FROM v
  ),
  hours AS (
    SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Africa/Lagos')::int AS h, COUNT(*)::int AS n
      FROM v
     WHERE created_at IS NOT NULL
     GROUP BY 1
  ),
  heat AS (
    -- weekday (0 = Sunday ... 6 = Saturday) x hour of day, Nigeria time
    SELECT EXTRACT(DOW  FROM created_at AT TIME ZONE 'Africa/Lagos')::int AS dow,
           EXTRACT(HOUR FROM created_at AT TIME ZONE 'Africa/Lagos')::int AS h,
           COUNT(*)::int AS n
      FROM v
     WHERE created_at IS NOT NULL
     GROUP BY 1, 2
  ),
  countries AS (
    -- ISO code of where each viewer is (last seen, else where they signed up).
    -- Any country that signs up is captured, so new markets show up by themselves.
    SELECT UPPER(COALESCE(NULLIF(ua.last_country, ''), NULLIF(ua.signup_country, ''))) AS code, COUNT(*)::int AS n
      FROM viewers vw
      JOIN user_analytics ua ON ua.user_id = vw.viewer_id
     WHERE COALESCE(NULLIF(ua.last_country, ''), NULLIF(ua.signup_country, '')) IS NOT NULL
     GROUP BY 1
  ),
  states AS (
    SELECT COALESCE(NULLIF(ua.last_region, ''), NULLIF(ua.signup_region, '')) AS label, COUNT(*)::int AS n
      FROM viewers vw
      JOIN user_analytics ua ON ua.user_id = vw.viewer_id
     WHERE UPPER(COALESCE(NULLIF(ua.last_country, ''), NULLIF(ua.signup_country, ''))) = 'NG'
       AND COALESCE(NULLIF(ua.last_region, ''), NULLIF(ua.signup_region, '')) IS NOT NULL
     GROUP BY 1
  ),
  ages AS (
    SELECT CASE WHEN a < 18 THEN 'Under 18'
                WHEN a < 25 THEN '18-24'
                WHEN a < 35 THEN '25-34'
                WHEN a < 45 THEN '35-44'
                ELSE '45+' END AS label,
           COUNT(*)::int AS n
      FROM (
        SELECT date_part('year', age(u.date_of_birth))::int AS a
          FROM viewers vw
          JOIN users u ON u.id = vw.viewer_id
         WHERE u.date_of_birth IS NOT NULL
      ) x
     WHERE a BETWEEN 13 AND 100
     GROUP BY 1
  )
  SELECT jsonb_build_object(
    'viewers',      (SELECT COUNT(*) FROM viewers),
    'hours',        (SELECT COALESCE(jsonb_agg(jsonb_build_object('hour', h, 'count', n) ORDER BY h), '[]'::jsonb) FROM hours),
    'heat',         (SELECT COALESCE(jsonb_agg(jsonb_build_object('dow', dow, 'hour', h, 'count', n) ORDER BY dow, h), '[]'::jsonb) FROM heat),
    'countries',    (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', code, 'count', n) ORDER BY n DESC, code), '[]'::jsonb)
                       FROM (SELECT code, n FROM countries ORDER BY n DESC, code LIMIT 8) c),
    'country_sample', (SELECT COALESCE(SUM(n), 0) FROM countries),
    'states',       (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'count', n) ORDER BY n DESC, label), '[]'::jsonb)
                       FROM (SELECT label, n FROM states ORDER BY n DESC, label LIMIT 8) s),
    'state_sample', (SELECT COALESCE(SUM(n), 0) FROM states),
    'ages',         (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'count', n)), '[]'::jsonb) FROM ages),
    'age_sample',   (SELECT COALESCE(SUM(n), 0) FROM ages)
  );
$$;


REVOKE ALL ON FUNCTION creator_audience_stats(UUID, TIMESTAMPTZ)     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION creator_audience_stats(UUID, TIMESTAMPTZ)  TO service_role;
