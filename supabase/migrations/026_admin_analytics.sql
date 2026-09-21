-- ============================================================================
-- 026_admin_analytics.sql
--
-- Powers the admin "Insights" page: where users are (country, and Nigerian
-- state), what devices they use, how they use the app, how dense the content
-- is, and which topics are active.
--
-- Safe to run more than once (IF NOT EXISTS / CREATE OR REPLACE).
-- Run it in the Supabase SQL editor.
--
-- What it adds
--   * user_analytics                  where a person registered / was last seen
--                                     and on what device (one row per user)
--   * user_daily_activity             one row per user per active day (usage,
--                                     devices, DAU/WAU/MAU history)
--   * record_user_activity()          the write path the app calls
--   * admin_insights_*()              read-only aggregation functions
--
-- Privacy: only country + region (state) are stored - never IP addresses.
-- These live in their OWN tables, not on `users`: the users table is publicly
-- readable through the API (policy users_public_read), so location and device
-- data must not be added there. Both new tables are closed to everyone except
-- the service role, and so are all the functions.
-- ============================================================================

-- 1. Private per-user analytics -----------------------------------------------
CREATE TABLE IF NOT EXISTS user_analytics (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  signup_country     TEXT,        -- ISO 3166-1 alpha-2, e.g. NG
  signup_region      TEXT,        -- state / region as reported, e.g. Lagos
  signup_device_type TEXT,        -- mobile | tablet | desktop
  signup_os          TEXT,
  signup_app_mode    TEXT,        -- app | pwa | browser
  last_country       TEXT,
  last_region        TEXT,
  last_seen_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_analytics ENABLE ROW LEVEL SECURITY;   -- no policies = closed

CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);

-- 2. Daily activity -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_daily_activity (
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day           DATE        NOT NULL,                 -- Africa/Lagos calendar day
  device_type   TEXT,
  os            TEXT,
  browser       TEXT,
  app_mode      TEXT,
  country       TEXT,
  region        TEXT,
  sessions      INTEGER     NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_user_daily_activity_day ON user_daily_activity (day);

-- RLS on with no policies: nobody but the service role can read or write it.
ALTER TABLE user_daily_activity ENABLE ROW LEVEL SECURITY;

-- Belt and braces: also remove the default table grants from the API roles.
REVOKE ALL ON user_analytics      FROM anon, authenticated;
REVOKE ALL ON user_daily_activity FROM anon, authenticated;

-- 3. Helper: today's date in Nigeria -------------------------------------------
CREATE OR REPLACE FUNCTION admin_lagos_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'Africa/Lagos')::date
$$;

-- 4. Write path: called by the app (via the service role) ------------------------
CREATE OR REPLACE FUNCTION record_user_activity(
  p_user_id     uuid,
  p_device_type text,
  p_os          text,
  p_browser     text,
  p_app_mode    text,
  p_country     text,
  p_region      text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_day     date := admin_lagos_today();
  v_created timestamptz;
BEGIN
  SELECT created_at INTO v_created FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO user_daily_activity AS a
    (user_id, day, device_type, os, browser, app_mode, country, region)
  VALUES
    (p_user_id, v_day, p_device_type, p_os, p_browser, p_app_mode, p_country, p_region)
  ON CONFLICT (user_id, day) DO UPDATE SET
    sessions     = a.sessions + 1,
    last_seen_at = now(),
    device_type  = COALESCE(EXCLUDED.device_type, a.device_type),
    os           = COALESCE(EXCLUDED.os,          a.os),
    browser      = COALESCE(EXCLUDED.browser,     a.browser),
    app_mode     = COALESCE(EXCLUDED.app_mode,    a.app_mode),
    country      = COALESCE(EXCLUDED.country,     a.country),
    region       = COALESCE(EXCLUDED.region,      a.region);

  -- The first visit after registering doubles as the "signup" context: where
  -- and on what they joined. It is written once (only when the row is first
  -- created) and only for accounts under 3 days old; later visits just update
  -- the "last seen" fields.
  INSERT INTO user_analytics AS ua
    (user_id, signup_country, signup_region, signup_device_type, signup_os, signup_app_mode,
     last_country, last_region, last_seen_at)
  VALUES
    (p_user_id,
     CASE WHEN v_created > now() - interval '3 days' THEN p_country     END,
     CASE WHEN v_created > now() - interval '3 days' THEN p_region      END,
     CASE WHEN v_created > now() - interval '3 days' THEN p_device_type END,
     CASE WHEN v_created > now() - interval '3 days' THEN p_os          END,
     CASE WHEN v_created > now() - interval '3 days' THEN p_app_mode    END,
     p_country, p_region, now())
  ON CONFLICT (user_id) DO UPDATE SET
    last_country = COALESCE(EXCLUDED.last_country, ua.last_country),
    last_region  = COALESCE(EXCLUDED.last_region,  ua.last_region),
    last_seen_at = now();
END;
$$;

-- 5. Registrations: totals, growth, per day, by country, Nigeria by state ----------
CREATE OR REPLACE FUNCTION admin_insights_registrations(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_days  integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  v_today date    := admin_lagos_today();
BEGIN
  RETURN (
    WITH base AS (
      SELECT
        u.id,
        u.created_at,
        NULLIF(upper(COALESCE(ua.signup_country, ua.last_country)), '') AS country,
        NULLIF(COALESCE(ua.signup_region, ua.last_region), '')          AS region,
        NULLIF(btrim(u.location), '')                                   AS profile_location
      FROM users u
      LEFT JOIN user_analytics ua ON ua.user_id = u.id
      WHERE u.deleted_at IS NULL
    ),
    days AS (
      SELECT g::date AS day
      FROM generate_series((v_today - (v_days - 1))::timestamp, v_today::timestamp, interval '1 day') AS g
    ),
    daily AS (
      SELECT d.day, count(b.id) AS n
      FROM days d
      LEFT JOIN base b ON (b.created_at AT TIME ZONE 'Africa/Lagos')::date = d.day
      GROUP BY d.day
    )
    SELECT jsonb_build_object(
      'total',        (SELECT count(*) FROM base),
      'new_period',   (SELECT count(*) FROM base
                        WHERE created_at >= now() - make_interval(days => v_days)),
      'prev_period',  (SELECT count(*) FROM base
                        WHERE created_at >= now() - make_interval(days => v_days * 2)
                          AND created_at <  now() - make_interval(days => v_days)),
      'with_country', (SELECT count(*) FROM base WHERE country IS NOT NULL),
      'daily',        (SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'count', n) ORDER BY day), '[]'::jsonb)
                        FROM daily),
      'by_country',   (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', code, 'count', n) ORDER BY n DESC, code), '[]'::jsonb)
                        FROM (SELECT country AS code, count(*) AS n
                                FROM base WHERE country IS NOT NULL GROUP BY country) c),
      'by_region',    (SELECT COALESCE(jsonb_agg(jsonb_build_object('region', region, 'count', n) ORDER BY n DESC, region), '[]'::jsonb)
                        FROM (SELECT region, count(*) AS n
                                FROM base WHERE country = 'NG' AND region IS NOT NULL GROUP BY region) r),
      'unlocated',    (SELECT COALESCE(jsonb_agg(jsonb_build_object('location', profile_location, 'count', n) ORDER BY n DESC, profile_location), '[]'::jsonb)
                        FROM (SELECT profile_location, count(*) AS n
                                FROM base
                               WHERE country IS NULL AND profile_location IS NOT NULL
                               GROUP BY profile_location
                               ORDER BY count(*) DESC
                               LIMIT 300) u),
      'unlocated_no_text', (SELECT count(*) FROM base WHERE country IS NULL AND profile_location IS NULL)
    )
  );
END;
$$;

-- 6. Usage: DAU / WAU / MAU, activity by hour and weekday, retention, actions ------
CREATE OR REPLACE FUNCTION admin_insights_usage(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_days     integer     := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  v_today    date        := admin_lagos_today();
  v_since    timestamptz := now() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 365));
  v_messages bigint      := NULL;
BEGIN
  -- Direct messages: counted only if the table exists in this database.
  IF to_regclass('public.messages') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.messages WHERE created_at >= $1'
      INTO v_messages USING v_since;
  END IF;

  RETURN (
    WITH days AS (
      SELECT g::date AS day
      FROM generate_series((v_today - (v_days - 1))::timestamp, v_today::timestamp, interval '1 day') AS g
    ),
    dau AS (
      SELECT d.day, count(a.user_id) AS n
      FROM days d
      LEFT JOIN user_daily_activity a ON a.day = d.day
      GROUP BY d.day
    ),
    acts AS (
      SELECT created_at FROM posts WHERE deleted_at IS NULL AND created_at >= v_since
      UNION ALL
      SELECT created_at FROM likes WHERE created_at >= v_since
    ),
    hours AS (
      SELECT extract(hour FROM (created_at AT TIME ZONE 'Africa/Lagos'))::int AS h, count(*) AS n
      FROM acts
      GROUP BY 1
    ),
    weekdays AS (
      SELECT extract(isodow FROM (created_at AT TIME ZONE 'Africa/Lagos'))::int AS w, count(*) AS n
      FROM acts
      GROUP BY 1
    )
    SELECT jsonb_build_object(
      'dau_today',       (SELECT count(*) FROM user_daily_activity WHERE day = v_today),
      'wau',             (SELECT count(DISTINCT user_id) FROM user_daily_activity WHERE day > v_today - 7),
      'mau',             (SELECT count(DISTINCT user_id) FROM user_daily_activity WHERE day > v_today - 30),
      'active_period',   (SELECT count(DISTINCT user_id) FROM user_daily_activity WHERE day > v_today - v_days),
      'sessions_period', (SELECT COALESCE(sum(sessions), 0) FROM user_daily_activity WHERE day > v_today - v_days),
      'tracking_since',  (SELECT min(day) FROM user_daily_activity),
      'daily',           (SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'count', n) ORDER BY day), '[]'::jsonb) FROM dau),
      'by_hour',         (SELECT COALESCE(jsonb_agg(jsonb_build_object('hour', h, 'count', n) ORDER BY h), '[]'::jsonb) FROM hours),
      'by_weekday',      (SELECT COALESCE(jsonb_agg(jsonb_build_object('weekday', w, 'count', n) ORDER BY w), '[]'::jsonb) FROM weekdays),
      'retained_7d',     (SELECT count(DISTINCT u.id)
                            FROM users u
                            JOIN user_daily_activity a ON a.user_id = u.id
                           WHERE u.deleted_at IS NULL
                             AND u.created_at <= now() - interval '7 days'
                             AND a.day > v_today - 7),
      'eligible_7d',     (SELECT count(*) FROM users
                           WHERE deleted_at IS NULL AND created_at <= now() - interval '7 days'),
      'posts',           (SELECT count(*) FROM posts WHERE deleted_at IS NULL AND post_type = 'original' AND created_at >= v_since),
      'replies',         (SELECT count(*) FROM posts WHERE deleted_at IS NULL AND post_type = 'reply'    AND created_at >= v_since),
      'quotes',          (SELECT count(*) FROM posts WHERE deleted_at IS NULL AND post_type = 'quote'    AND created_at >= v_since),
      'reposts',         (SELECT count(*) FROM posts WHERE deleted_at IS NULL AND post_type = 'repost'   AND created_at >= v_since),
      'likes',           (SELECT count(*) FROM likes     WHERE created_at >= v_since),
      'follows',         (SELECT count(*) FROM follows   WHERE created_at >= v_since),
      'bookmarks',       (SELECT count(*) FROM bookmarks WHERE created_at >= v_since),
      'messages',        v_messages
    )
  );
END;
$$;

-- 7. Devices: what active people use (their most recent visit in the period) --------
CREATE OR REPLACE FUNCTION admin_insights_devices(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_days  integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  v_today date    := admin_lagos_today();
BEGIN
  RETURN (
    WITH latest AS (
      SELECT DISTINCT ON (user_id) user_id, device_type, os, browser, app_mode
      FROM user_daily_activity
      WHERE day > v_today - v_days
      ORDER BY user_id, day DESC
    )
    SELECT jsonb_build_object(
      'active_users', (SELECT count(*) FROM latest),
      'total_users',  (SELECT count(*) FROM users WHERE deleted_at IS NULL),
      'by_device_type', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', k, 'count', n) ORDER BY n DESC, k), '[]'::jsonb)
                           FROM (SELECT COALESCE(device_type, 'unknown') AS k, count(*) AS n FROM latest GROUP BY 1) t1),
      'by_os',          (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', k, 'count', n) ORDER BY n DESC, k), '[]'::jsonb)
                           FROM (SELECT COALESCE(os, 'unknown') AS k, count(*) AS n FROM latest GROUP BY 1) t2),
      'by_browser',     (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', k, 'count', n) ORDER BY n DESC, k), '[]'::jsonb)
                           FROM (SELECT COALESCE(browser, 'unknown') AS k, count(*) AS n FROM latest GROUP BY 1) t3),
      'by_app_mode',    (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', k, 'count', n) ORDER BY n DESC, k), '[]'::jsonb)
                           FROM (SELECT COALESCE(app_mode, 'unknown') AS k, count(*) AS n FROM latest GROUP BY 1) t4),
      'signup_by_device_type', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', k, 'count', n) ORDER BY n DESC, k), '[]'::jsonb)
                           FROM (SELECT ua.signup_device_type AS k, count(*) AS n
                                   FROM user_analytics ua
                                   JOIN users u ON u.id = ua.user_id
                                  WHERE u.deleted_at IS NULL AND ua.signup_device_type IS NOT NULL
                                  GROUP BY 1) t5)
    )
  );
END;
$$;

-- 8. Content density ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_insights_content(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_days    integer     := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  v_today   date        := admin_lagos_today();
  v_since   timestamptz := now() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 365));
  v_selling bigint      := NULL;
BEGIN
  -- "Selling" posts: counted only if this database has the is_selling column.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'is_selling'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public.posts WHERE is_selling = true AND deleted_at IS NULL AND created_at >= $1'
      INTO v_selling USING v_since;
  END IF;

  RETURN (
    WITH days AS (
      SELECT g::date AS day
      FROM generate_series((v_today - (v_days - 1))::timestamp, v_today::timestamp, interval '1 day') AS g
    ),
    period_posts AS (
      SELECT id, user_id, body, post_type::text AS post_type, language, created_at
      FROM posts
      WHERE deleted_at IS NULL AND created_at >= v_since
    ),
    daily AS (
      SELECT d.day, count(p.id) AS n
      FROM days d
      LEFT JOIN period_posts p ON (p.created_at AT TIME ZONE 'Africa/Lagos')::date = d.day
      GROUP BY d.day
    ),
    per_user AS (
      SELECT u.id, count(p.id) AS n
      FROM users u
      LEFT JOIN posts p
             ON p.user_id = u.id
            AND p.deleted_at IS NULL
            AND p.post_type IN ('original', 'reply', 'quote')
      WHERE u.deleted_at IS NULL
      GROUP BY u.id
    ),
    regional AS (
      SELECT COALESCE(ua.signup_region, ua.last_region) AS region, count(*) AS n
      FROM period_posts p
      JOIN user_analytics ua ON ua.user_id = p.user_id
      WHERE upper(COALESCE(ua.signup_country, ua.last_country, '')) = 'NG'
        AND COALESCE(ua.signup_region, ua.last_region) IS NOT NULL
      GROUP BY 1
    )
    SELECT jsonb_build_object(
      'total_posts',    (SELECT count(*) FROM period_posts),
      'active_authors', (SELECT count(DISTINCT user_id) FROM period_posts),
      'total_users',    (SELECT count(*) FROM users WHERE deleted_at IS NULL),
      'avg_length',     (SELECT round(avg(char_length(body))) FROM period_posts
                          WHERE post_type = 'original' AND body IS NOT NULL),
      'selling',        v_selling,
      'daily',          (SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'count', n) ORDER BY day), '[]'::jsonb) FROM daily),
      'by_type',        (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', post_type, 'count', n) ORDER BY n DESC, post_type), '[]'::jsonb)
                          FROM (SELECT post_type, count(*) AS n FROM period_posts GROUP BY post_type) t1),
      'by_language',    (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', language, 'count', n) ORDER BY n DESC, language), '[]'::jsonb)
                          FROM (SELECT COALESCE(language, 'unknown') AS language, count(*) AS n FROM period_posts GROUP BY 1) t2),
      'posts_with_media', (SELECT count(DISTINCT m.post_id)
                             FROM post_media m
                             JOIN period_posts p ON p.id = m.post_id),
      'media_by_type',  (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', mt, 'count', n) ORDER BY n DESC, mt), '[]'::jsonb)
                          FROM (SELECT m.media_type::text AS mt, count(*) AS n
                                  FROM post_media m
                                  JOIN period_posts p ON p.id = m.post_id
                                 GROUP BY 1) t3),
      'buckets',        jsonb_build_array(
                          jsonb_build_object('label', 'No posts', 'count', (SELECT count(*) FROM per_user WHERE n = 0)),
                          jsonb_build_object('label', '1 post',   'count', (SELECT count(*) FROM per_user WHERE n = 1)),
                          jsonb_build_object('label', '2-4',      'count', (SELECT count(*) FROM per_user WHERE n BETWEEN 2 AND 4)),
                          jsonb_build_object('label', '5-19',     'count', (SELECT count(*) FROM per_user WHERE n BETWEEN 5 AND 19)),
                          jsonb_build_object('label', '20+',      'count', (SELECT count(*) FROM per_user WHERE n >= 20))
                        ),
      'posts_by_region', (SELECT COALESCE(jsonb_agg(jsonb_build_object('region', region, 'count', n) ORDER BY n DESC, region), '[]'::jsonb)
                            FROM regional)
    )
  );
END;
$$;

-- 9. Topics: hashtags (with change vs the previous period) and chosen interests -------
CREATE OR REPLACE FUNCTION admin_insights_topics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_days  integer     := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  v_since timestamptz := now() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 365));
  v_prev  timestamptz := now() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 365) * 2);
BEGIN
  RETURN (
    WITH tag_counts AS (
      SELECT h.tag,
             count(*) FILTER (WHERE p.created_at >= v_since)                            AS cur_n,
             count(*) FILTER (WHERE p.created_at >= v_prev AND p.created_at < v_since)  AS prev_n
      FROM post_hashtags ph
      JOIN hashtags h ON h.id = ph.hashtag_id
      JOIN posts p    ON p.id = ph.post_id
                     AND p.deleted_at IS NULL
                     AND p.created_at >= v_prev
      GROUP BY h.tag
    )
    SELECT jsonb_build_object(
      'hashtags',            (SELECT COALESCE(jsonb_agg(jsonb_build_object('tag', tag, 'count', cur_n, 'prev', prev_n) ORDER BY cur_n DESC, tag), '[]'::jsonb)
                                FROM (SELECT tag, cur_n, prev_n FROM tag_counts
                                       WHERE cur_n > 0 ORDER BY cur_n DESC, tag LIMIT 25) t),
      'unique_tags',         (SELECT count(*) FROM tag_counts WHERE cur_n > 0),
      'tagged_posts',        (SELECT count(DISTINCT ph.post_id)
                                FROM post_hashtags ph
                                JOIN posts p ON p.id = ph.post_id
                               WHERE p.deleted_at IS NULL AND p.created_at >= v_since),
      'total_posts',         (SELECT count(*) FROM posts WHERE deleted_at IS NULL AND created_at >= v_since),
      'interests',           (SELECT COALESCE(jsonb_agg(jsonb_build_object('interest', interest, 'users', n) ORDER BY n DESC, interest), '[]'::jsonb)
                                FROM (SELECT interest, count(*) AS n FROM user_interests GROUP BY interest) i),
      'users_with_interests', (SELECT count(DISTINCT user_id) FROM user_interests)
    )
  );
END;
$$;

-- 10. Lock everything to the service role ---------------------------------------------
REVOKE ALL ON FUNCTION admin_lagos_today()                                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION record_user_activity(uuid, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_insights_registrations(integer)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_insights_usage(integer)                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_insights_devices(integer)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_insights_content(integer)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_insights_topics(integer)                        FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION admin_lagos_today()                                   TO service_role;
GRANT EXECUTE ON FUNCTION record_user_activity(uuid, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION admin_insights_registrations(integer)                 TO service_role;
GRANT EXECUTE ON FUNCTION admin_insights_usage(integer)                         TO service_role;
GRANT EXECUTE ON FUNCTION admin_insights_devices(integer)                       TO service_role;
GRANT EXECUTE ON FUNCTION admin_insights_content(integer)                       TO service_role;
GRANT EXECUTE ON FUNCTION admin_insights_topics(integer)                        TO service_role;

-- Make the new functions visible to the API straight away.
NOTIFY pgrst, 'reload schema';

-- Quick check after running (each should return a JSON object):
--   SELECT admin_insights_registrations(30);
--   SELECT admin_insights_usage(30);
--   SELECT admin_insights_devices(30);
--   SELECT admin_insights_content(30);
--   SELECT admin_insights_topics(30);
