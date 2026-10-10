-- ============================================================
-- 052_follow_rate_limit_v2.sql
--
-- Follow-spam limit, second version: short first pause, then longer
-- ones if the person keeps going.
--
--   1st burst  ->  7 minutes
--   2nd burst  ->  1 hour
--   3rd burst  ->  3 hours
--   4th+ burst ->  6 hours
--
-- A "burst" is hitting the burst limit inside the burst window. Strikes are
-- forgotten after p_strike_reset_secs (24 hours) without a new pause. Trying
-- to follow WHILE paused never adds a strike - it just returns the same end
-- time, so the app can show how long is left.
--
-- The numbers and the ladder are passed in by the app (src/lib/actions/follows.ts),
-- so they can be tuned without another migration.
--
-- Added as a NEW function (register_follow_attempt_v2) and the old one is left
-- alone, so the app keeps working whichever of the two is deployed first.
--
-- Safe to run more than once.
-- ============================================================

ALTER TABLE follow_limits ADD COLUMN IF NOT EXISTS strikes        INT NOT NULL DEFAULT 0;
ALTER TABLE follow_limits ADD COLUMN IF NOT EXISTS last_strike_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION register_follow_attempt_v2(
  p_user              UUID,
  p_burst_limit       INT,
  p_burst_window_secs INT,
  p_pause_ladder_secs INT[],   -- pause length for strike 1, 2, 3...; the last one repeats
  p_strike_reset_secs INT,     -- strikes are forgotten after this long without a pause
  p_daily_limit       INT,
  p_daily_pause_secs  INT
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked   TIMESTAMPTZ;
  v_strikes   INT;
  v_last      TIMESTAMPTZ;
  v_burst     INT;
  v_daily     INT;
  v_until     TIMESTAMPTZ;
  v_burst_hit BOOLEAN := FALSE;
  v_step      INT;
BEGIN
  -- One request per user at a time, so two parallel follows can't both slip under the limit
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  SELECT blocked_until, strikes, last_strike_at
    INTO v_blocked, v_strikes, v_last
    FROM follow_limits WHERE user_id = p_user;

  -- Still paused: same end time back, no new strike
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
    v_burst_hit := TRUE;
    IF v_last IS NULL OR v_last < NOW() - make_interval(secs => p_strike_reset_secs) THEN
      v_strikes := 0;
    END IF;
    v_strikes := COALESCE(v_strikes, 0) + 1;
    v_step    := LEAST(v_strikes, array_length(p_pause_ladder_secs, 1));
    v_until   := NOW() + make_interval(secs => p_pause_ladder_secs[v_step]);
  ELSIF v_daily >= p_daily_limit THEN
    v_until := NOW() + make_interval(secs => p_daily_pause_secs);
  END IF;

  IF v_until IS NOT NULL THEN
    INSERT INTO follow_limits (user_id, blocked_until, strikes, last_strike_at)
    VALUES (p_user, v_until, COALESCE(v_strikes, 0), CASE WHEN v_burst_hit THEN NOW() ELSE v_last END)
    ON CONFLICT (user_id) DO UPDATE
      SET blocked_until  = EXCLUDED.blocked_until,
          strikes        = EXCLUDED.strikes,
          last_strike_at = EXCLUDED.last_strike_at;
    DELETE FROM follow_attempts WHERE user_id = p_user;  -- start clean once the pause ends
    RETURN v_until;
  END IF;

  INSERT INTO follow_attempts (user_id) VALUES (p_user);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION register_follow_attempt_v2(UUID, INT, INT, INT[], INT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION register_follow_attempt_v2(UUID, INT, INT, INT[], INT, INT, INT) TO service_role;
