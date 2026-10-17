-- ============================================================
-- 058_creator_analytics.sql
--
-- Backs the Premium-only /analytics page ("Audience by state, age,
-- active hours" on the landing page).
--
-- One aggregate call per page view. It returns COUNTS ONLY - never
-- who a viewer is - so a creator can't identify anyone from it:
--   * hours  : when people first viewed the creator's posts (Africa/Lagos)
--   * states : where those viewers are, from user_analytics (Nigeria only)
--   * ages   : age bands from users.date_of_birth
--
-- Premium is enforced by the app (src/lib/analytics.ts) before this is
-- ever called. The function itself is closed to everyone but the service
-- role, like the other analytics functions (see 026_admin_analytics.sql).
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
       AND p.created_at >= p_since
       AND pv.user_id <> p_user_id
  ),
  viewers AS (
    SELECT DISTINCT viewer_id FROM v
  ),
  hours AS (
    SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Africa/Lagos')::int AS h, COUNT(*)::int AS n
      FROM v GROUP BY 1
  ),
  states AS (
    SELECT COALESCE(NULLIF(ua.last_region, ''), NULLIF(ua.signup_region, '')) AS label, COUNT(*)::int AS n
      FROM viewers vw
      JOIN user_analytics ua ON ua.user_id = vw.viewer_id
     WHERE COALESCE(ua.last_country, ua.signup_country) = 'NG'
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
    'states',       (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'count', n) ORDER BY n DESC, label), '[]'::jsonb)
                       FROM (SELECT label, n FROM states ORDER BY n DESC, label LIMIT 8) s),
    'state_sample', (SELECT COALESCE(SUM(n), 0) FROM states),
    'ages',         (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'count', n)), '[]'::jsonb) FROM ages),
    'age_sample',   (SELECT COALESCE(SUM(n), 0) FROM ages)
  );
$$;

REVOKE ALL ON FUNCTION creator_audience_stats(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION creator_audience_stats(UUID, TIMESTAMPTZ) TO service_role;
