-- ============================================================
-- 061_analytics_timezones_regions_cache.sql
--
-- Final analytics SQL. Run after 058, 059 and 060 (it supersedes their two
-- functions, so it is safe to run on top of them).
--
--   1. creator_daily_series / creator_audience_stats now take the CREATOR'S
--      time zone, so "days" and "active times" are on their own clock (Lagos,
--      Accra, Amsterdam...). Default stays Africa/Lagos.
--   2. creator_audience_stats also returns `abroad`: top regions of viewers who
--      are OUTSIDE Nigeria (country + region), for the "Other countries" card.
--   3. analytics_cache: finished analytics are kept for a few minutes so a
--      creator with a big audience doesn't re-run the heavy queries on every view.
--   4. auth_account_methods: lets forgot-password see whether an email is a
--      password account or Google/Facebook only (so social accounts can't be
--      given a second sign-in method by a password reset).
--   5. The date-range indexes (harmless if 059 already made them).
--
-- COUNTS ONLY - nothing here says who viewed, liked or followed.
-- ============================================================

-- The old signatures have to go: a function with an added defaulted argument would
-- otherwise clash with the old one ("function is not unique").
DROP FUNCTION IF EXISTS creator_daily_series(UUID, INT);
DROP FUNCTION IF EXISTS creator_audience_stats(UUID, TIMESTAMPTZ);

-- ─── 1. Daily series, in the creator's time zone ─────────────────────────────
CREATE OR REPLACE FUNCTION creator_daily_series(p_user_id UUID, p_days INT DEFAULT 730, p_tz TEXT DEFAULT 'Africa/Lagos')
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  WITH tzc AS (
    -- the creator's time zone, if Postgres knows it (else Nigeria time)
    SELECT COALESCE((SELECT name FROM pg_timezone_names WHERE name = p_tz LIMIT 1), 'Africa/Lagos') AS tz
  ),
  bounds AS (
    SELECT (NOW() AT TIME ZONE (SELECT tz FROM tzc))::date AS today,
           ((NOW() AT TIME ZONE (SELECT tz FROM tzc))::date - (GREATEST(p_days, 1) - 1)) AS first_day
  ),
  since AS (
    -- start of the first day, as a real timestamp in Lagos time
    SELECT (b.first_day::timestamp AT TIME ZONE (SELECT tz FROM tzc)) AS ts FROM bounds b
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
    SELECT (pv.created_at AT TIME ZONE (SELECT tz FROM tzc))::date AS d, COUNT(*)::int AS n
      FROM post_views pv
      JOIN mine m ON m.id = pv.post_id
     WHERE pv.user_id <> p_user_id
       AND pv.created_at >= (SELECT ts FROM since)
     GROUP BY 1
  ),
  lk AS (
    SELECT (l.created_at AT TIME ZONE (SELECT tz FROM tzc))::date AS d, COUNT(*)::int AS n
      FROM likes l
      JOIN mine m ON m.id = l.post_id
     WHERE l.user_id <> p_user_id
       AND l.created_at >= (SELECT ts FROM since)
     GROUP BY 1
  ),
  bm AS (
    SELECT (b.created_at AT TIME ZONE (SELECT tz FROM tzc))::date AS d, COUNT(*)::int AS n
      FROM bookmarks b
      JOIN mine m ON m.id = b.post_id
     WHERE b.user_id <> p_user_id
       AND b.created_at >= (SELECT ts FROM since)
     GROUP BY 1
  ),
  rp AS (
    SELECT (r.created_at AT TIME ZONE (SELECT tz FROM tzc))::date AS d, COUNT(*)::int AS n
      FROM posts r
      JOIN mine m ON m.id = r.parent_post_id
     WHERE r.user_id <> p_user_id
       AND r.deleted_at IS NULL
       AND r.created_at >= (SELECT ts FROM since)
     GROUP BY 1
  ),
  rs AS (
    SELECT (r.created_at AT TIME ZONE (SELECT tz FROM tzc))::date AS d, COUNT(*)::int AS n
      FROM posts r
      JOIN mine m ON m.id = r.quoted_post_id
     WHERE r.user_id <> p_user_id
       AND r.post_type = 'repost'
       AND r.deleted_at IS NULL
       AND r.created_at >= (SELECT ts FROM since)
     GROUP BY 1
  ),
  qt AS (
    SELECT (r.created_at AT TIME ZONE (SELECT tz FROM tzc))::date AS d, COUNT(*)::int AS n
      FROM posts r
      JOIN mine m ON m.id = r.quoted_post_id
     WHERE r.user_id <> p_user_id
       AND r.post_type <> 'repost'
       AND r.deleted_at IS NULL
       AND r.created_at >= (SELECT ts FROM since)
     GROUP BY 1
  ),
  fl AS (
    SELECT (f.created_at AT TIME ZONE (SELECT tz FROM tzc))::date AS d, COUNT(*)::int AS n
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

-- ─── 2. Audience stats, in the creator's time zone, with regions abroad ──────
CREATE OR REPLACE FUNCTION creator_audience_stats(p_user_id UUID, p_since TIMESTAMPTZ, p_tz TEXT DEFAULT 'Africa/Lagos')
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  WITH tzc AS (
    SELECT COALESCE((SELECT name FROM pg_timezone_names WHERE name = p_tz LIMIT 1), 'Africa/Lagos') AS tz
  ),
  v AS (
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
    SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE (SELECT tz FROM tzc))::int AS h, COUNT(*)::int AS n
      FROM v
     WHERE created_at IS NOT NULL
     GROUP BY 1
  ),
  heat AS (
    -- weekday (0 = Sunday ... 6 = Saturday) x hour of day, Nigeria time
    SELECT EXTRACT(DOW  FROM created_at AT TIME ZONE (SELECT tz FROM tzc))::int AS dow,
           EXTRACT(HOUR FROM created_at AT TIME ZONE (SELECT tz FROM tzc))::int AS h,
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
  abroad AS (
    -- viewers outside Nigeria, by country + region (Cloudflare gives the region name)
    SELECT UPPER(COALESCE(NULLIF(ua.last_country, ''), NULLIF(ua.signup_country, ''))) AS code,
           COALESCE(NULLIF(ua.last_region, ''), NULLIF(ua.signup_region, '')) AS label,
           COUNT(*)::int AS n
      FROM viewers vw
      JOIN user_analytics ua ON ua.user_id = vw.viewer_id
     WHERE COALESCE(NULLIF(ua.last_country, ''), NULLIF(ua.signup_country, '')) IS NOT NULL
       AND UPPER(COALESCE(NULLIF(ua.last_country, ''), NULLIF(ua.signup_country, ''))) <> 'NG'
       AND COALESCE(NULLIF(ua.last_region, ''), NULLIF(ua.signup_region, '')) IS NOT NULL
     GROUP BY 1, 2
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
    'abroad',       (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', code, 'label', label, 'count', n) ORDER BY n DESC, code, label), '[]'::jsonb)
                       FROM (SELECT code, label, n FROM abroad ORDER BY n DESC, code, label LIMIT 8) x),
    'abroad_sample', (SELECT COALESCE(SUM(n), 0) FROM abroad),
    'ages',         (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'count', n)), '[]'::jsonb) FROM ages),
    'age_sample',   (SELECT COALESCE(SUM(n), 0) FROM ages)
  );
$$;

-- ─── 3. Short-lived cache of finished analytics ──────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_cache (
  cache_key   TEXT PRIMARY KEY,                 -- e.g. series:<user>:<tz>, audience:<user>:28:<tz>
  payload     JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE analytics_cache ENABLE ROW LEVEL SECURITY;   -- no policies = closed
REVOKE ALL ON analytics_cache FROM anon, authenticated;

-- ─── 4. Which sign-in methods does this email have? ──────────────────────────
CREATE OR REPLACE FUNCTION auth_account_methods(p_email TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
              'exists', true,
              'providers', COALESCE(jsonb_agg(DISTINCT i.provider) FILTER (WHERE i.provider IS NOT NULL), '[]'::jsonb))
       FROM auth.users u
       LEFT JOIN auth.identities i ON i.user_id = u.id
      WHERE lower(u.email) = lower(p_email)
      GROUP BY u.id
      LIMIT 1),
    jsonb_build_object('exists', false, 'providers', '[]'::jsonb)
  );
$$;

-- ─── 5. Indexes for the date-range lookups ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_post_views_post_created   ON post_views (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_likes_post_created        ON likes (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bookmarks_post_created    ON bookmarks (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_follows_following_created ON follows (following_id, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_parent_created      ON posts (parent_post_id, created_at) WHERE parent_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_quoted_created      ON posts (quoted_post_id, created_at) WHERE quoted_post_id IS NOT NULL;

-- ─── 6. Locked down to the service role ──────────────────────────────────────
REVOKE ALL ON FUNCTION creator_daily_series(UUID, INT, TEXT)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION creator_audience_stats(UUID, TIMESTAMPTZ, TEXT)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION auth_account_methods(TEXT)                        FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION creator_daily_series(UUID, INT, TEXT)           TO service_role;
GRANT EXECUTE ON FUNCTION creator_audience_stats(UUID, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION auth_account_methods(TEXT)                      TO service_role;
