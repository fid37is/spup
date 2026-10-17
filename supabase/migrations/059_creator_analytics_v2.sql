-- ============================================================
-- 059_creator_analytics_v2.sql
--
-- Backs the redesigned Premium /analytics page (charts over time, 1W-1Y ranges,
-- metric and chart-type toggles, active-times heatmap).
--
--   1. creator_daily_series  - one row per day (Africa/Lagos), zero-filled:
--                              impressions, likes, replies, reposts, quotes,
--                              bookmarks and new follows on the creator's posts.
--   2. creator_audience_stats - REPLACED (same name and arguments as 058). Now
--                              also returns `heat` (weekday x hour of day), and
--                              the window is "when the view happened", so
--                              "last 7 days" means views in the last 7 days.
--   3. A few indexes so the date-range queries stay fast.
--
-- COUNTS ONLY. Nothing here reveals who viewed, liked or followed.
-- Premium is enforced by the app (src/lib/analytics.ts); both functions are
-- closed to everyone but the service role, like the rest of the analytics SQL.
--
-- Needs 058 (and post_views.created_at) to have been applied first.
-- ============================================================

-- ─── 1. Daily series ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION creator_daily_series(p_user_id UUID, p_days INT DEFAULT 730)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  WITH bounds AS (
    SELECT (NOW() AT TIME ZONE 'Africa/Lagos')::date AS today,
           ((NOW() AT TIME ZONE 'Africa/Lagos')::date - (GREATEST(p_days, 1) - 1)) AS first_day
  ),
  since AS (
    -- start of the first day, as a real timestamp in Lagos time
    SELECT (b.first_day::timestamp AT TIME ZONE 'Africa/Lagos') AS ts FROM bounds b
  ),
  days AS (
    SELECT g::date AS d
      FROM bounds b, generate_series(b.first_day, b.today, INTERVAL '1 day') AS g
  ),
  mine AS (
    SELECT id FROM posts
     WHERE user_id = p_user_id
       AND deleted_at IS NULL
       AND post_type <> 'repost'
  ),
  imp AS (
    SELECT (pv.created_at AT TIME ZONE 'Africa/Lagos')::date AS d, COUNT(*)::int AS n
      FROM post_views pv
      JOIN mine m ON m.id = pv.post_id
     WHERE pv.user_id <> p_user_id
       AND pv.created_at >= (SELECT ts FROM since)
     GROUP BY 1
  ),
  lk AS (
    SELECT (l.created_at AT TIME ZONE 'Africa/Lagos')::date AS d, COUNT(*)::int AS n
      FROM likes l
      JOIN mine m ON m.id = l.post_id
     WHERE l.user_id <> p_user_id
       AND l.created_at >= (SELECT ts FROM since)
     GROUP BY 1
  ),
  bm AS (
    SELECT (b.created_at AT TIME ZONE 'Africa/Lagos')::date AS d, COUNT(*)::int AS n
      FROM bookmarks b
      JOIN mine m ON m.id = b.post_id
     WHERE b.user_id <> p_user_id
       AND b.created_at >= (SELECT ts FROM since)
     GROUP BY 1
  ),
  rp AS (
    SELECT (r.created_at AT TIME ZONE 'Africa/Lagos')::date AS d, COUNT(*)::int AS n
      FROM posts r
      JOIN mine m ON m.id = r.parent_post_id
     WHERE r.user_id <> p_user_id
       AND r.deleted_at IS NULL
       AND r.created_at >= (SELECT ts FROM since)
     GROUP BY 1
  ),
  rs AS (
    SELECT (r.created_at AT TIME ZONE 'Africa/Lagos')::date AS d, COUNT(*)::int AS n
      FROM posts r
      JOIN mine m ON m.id = r.quoted_post_id
     WHERE r.user_id <> p_user_id
       AND r.post_type = 'repost'
       AND r.deleted_at IS NULL
       AND r.created_at >= (SELECT ts FROM since)
     GROUP BY 1
  ),
  qt AS (
    SELECT (r.created_at AT TIME ZONE 'Africa/Lagos')::date AS d, COUNT(*)::int AS n
      FROM posts r
      JOIN mine m ON m.id = r.quoted_post_id
     WHERE r.user_id <> p_user_id
       AND r.post_type <> 'repost'
       AND r.deleted_at IS NULL
       AND r.created_at >= (SELECT ts FROM since)
     GROUP BY 1
  ),
  fl AS (
    SELECT (f.created_at AT TIME ZONE 'Africa/Lagos')::date AS d, COUNT(*)::int AS n
      FROM follows f
     WHERE f.following_id = p_user_id
       AND f.created_at >= (SELECT ts FROM since)
     GROUP BY 1
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'd',           to_char(days.d, 'YYYY-MM-DD'),
        'impressions', COALESCE(imp.n, 0),
        'likes',       COALESCE(lk.n, 0),
        'replies',     COALESCE(rp.n, 0),
        'reposts',     COALESCE(rs.n, 0),
        'quotes',      COALESCE(qt.n, 0),
        'bookmarks',   COALESCE(bm.n, 0),
        'follows',     COALESCE(fl.n, 0)
      )
      ORDER BY days.d
    ),
    '[]'::jsonb
  )
  FROM days
  LEFT JOIN imp ON imp.d = days.d
  LEFT JOIN lk  ON lk.d  = days.d
  LEFT JOIN rp  ON rp.d  = days.d
  LEFT JOIN rs  ON rs.d  = days.d
  LEFT JOIN qt  ON qt.d  = days.d
  LEFT JOIN bm  ON bm.d  = days.d
  LEFT JOIN fl  ON fl.d  = days.d;
$$;

-- ─── 2. Audience stats (replaces the 058 version) ───────────────────────────
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
    'heat',         (SELECT COALESCE(jsonb_agg(jsonb_build_object('dow', dow, 'hour', h, 'count', n) ORDER BY dow, h), '[]'::jsonb) FROM heat),
    'states',       (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'count', n) ORDER BY n DESC, label), '[]'::jsonb)
                       FROM (SELECT label, n FROM states ORDER BY n DESC, label LIMIT 8) s),
    'state_sample', (SELECT COALESCE(SUM(n), 0) FROM states),
    'ages',         (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'count', n)), '[]'::jsonb) FROM ages),
    'age_sample',   (SELECT COALESCE(SUM(n), 0) FROM ages)
  );
$$;

-- ─── 3. Indexes for the date-range lookups ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_post_views_post_created   ON post_views (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_likes_post_created        ON likes (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bookmarks_post_created    ON bookmarks (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_follows_following_created ON follows (following_id, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_parent_created      ON posts (parent_post_id, created_at) WHERE parent_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_quoted_created      ON posts (quoted_post_id, created_at) WHERE quoted_post_id IS NOT NULL;

-- ─── 4. Locked down to the service role ──────────────────────────────────────
REVOKE ALL ON FUNCTION creator_daily_series(UUID, INT)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION creator_audience_stats(UUID, TIMESTAMPTZ)     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION creator_daily_series(UUID, INT)            TO service_role;
GRANT EXECUTE ON FUNCTION creator_audience_stats(UUID, TIMESTAMPTZ)  TO service_role;
