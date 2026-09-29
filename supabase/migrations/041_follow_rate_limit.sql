-- ============================================================
-- 039_follow_rate_limit.sql
--
-- Stops follow spam. Someone who follows too many accounts too
-- quickly has following paused for a few hours.
--
--   follow_attempts   one row per NEW follow (kept separately from the
--                     follows table on purpose: follow -> unfollow ->
--                     follow again still counts, which counting rows
--                     in `follows` alone would miss)
--   follow_limits     who is paused, and until when
--
-- register_follow_attempt() is called by the follow server action just
-- before a new follow is written. It returns NULL when the follow may
-- go ahead (and records it), or the time the pause ends when it may not.
-- The limits are passed in by the app, so they can be tuned in
-- src/lib/actions/follows.ts without another migration.
--
-- RLS is on with NO policies, and the function is executable by the
-- service role only - a signed-in user can't read, reset or call any of it.
--
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS follow_attempts (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS follow_attempts_user_time_idx ON follow_attempts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS follow_limits (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  blocked_until TIMESTAMPTZ NOT NULL
);

ALTER TABLE follow_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_limits   ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION register_follow_attempt(
  p_user              UUID,
  p_burst_limit       INT,   -- max new follows inside the burst window
  p_burst_window_secs INT,
  p_burst_pause_secs  INT,   -- how long to pause after a burst
  p_daily_limit       INT,   -- max new follows in any 24 hours
  p_daily_pause_secs  INT    -- how long to pause after hitting the daily cap
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked TIMESTAMPTZ;
  v_burst   INT;
  v_daily   INT;
  v_until   TIMESTAMPTZ;
BEGIN
  -- One request per user at a time, so two parallel follows can't both slip under the limit
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  SELECT blocked_until INTO v_blocked FROM follow_limits WHERE user_id = p_user;
  IF v_blocked IS NOT NULL AND v_blocked > NOW() THEN
    RETURN v_blocked;
  END IF;

  DELETE FROM follow_attempts WHERE user_id = p_user AND created_at < NOW() - INTERVAL '24 hours';

  SELECT COUNT(*) FILTER (WHERE created_at > NOW() - make_interval(secs => p_burst_window_secs)),
         COUNT(*)
    INTO v_burst, v_daily
    FROM follow_attempts
   WHERE user_id = p_user;

  IF v_burst >= p_burst_limit THEN
    v_until := NOW() + make_interval(secs => p_burst_pause_secs);
  ELSIF v_daily >= p_daily_limit THEN
    v_until := NOW() + make_interval(secs => p_daily_pause_secs);
  END IF;

  IF v_until IS NOT NULL THEN
    INSERT INTO follow_limits (user_id, blocked_until) VALUES (p_user, v_until)
    ON CONFLICT (user_id) DO UPDATE SET blocked_until = EXCLUDED.blocked_until;
    DELETE FROM follow_attempts WHERE user_id = p_user;  -- start clean once the pause ends
    RETURN v_until;
  END IF;

  INSERT INTO follow_attempts (user_id) VALUES (p_user);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION register_follow_attempt(UUID, INT, INT, INT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION register_follow_attempt(UUID, INT, INT, INT, INT, INT) TO service_role;