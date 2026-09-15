-- 016_rate_limiting.sql
--
-- No rate limiting existed anywhere in the app — not on withdrawal
-- initiation, not on login, not on anything. This adds a small,
-- dependency-free rate limiter backed by Postgres rather than Redis/KV,
-- since the actual deployment target (Vercel vs the in-progress Cloudflare
-- migration) wasn't settled — this works identically on either.
--
-- Fixed-window counter, atomic via a single INSERT ... ON CONFLICT so it
-- can't be raced the way the wallet balance updates were before migration
-- 014 — two concurrent requests against the same key still serialize
-- correctly at the row level.

CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  count        INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Not RLS-protected — this is only ever touched via the admin client from
-- server-side code (lib/rate-limit.ts), never directly from the client.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION check_rate_limit(p_key TEXT, p_max_attempts INT, p_window_seconds INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO rate_limits (key, count, window_start)
  VALUES (p_key, 1, NOW())
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN rate_limits.window_start < NOW() - (p_window_seconds || ' seconds')::INTERVAL
        THEN 1  -- previous window expired — start a fresh one
      ELSE rate_limits.count + 1
    END,
    window_start = CASE
      WHEN rate_limits.window_start < NOW() - (p_window_seconds || ' seconds')::INTERVAL
        THEN NOW()
      ELSE rate_limits.window_start
    END
  RETURNING count INTO v_count;

  RETURN v_count <= p_max_attempts;
END;
$$;

COMMENT ON FUNCTION check_rate_limit IS
  'Atomic fixed-window rate limiter. Returns true if this call is within the allowed p_max_attempts per p_window_seconds for p_key, false if the limit is exceeded. Call BEFORE doing the work you want limited, not after — see lib/rate-limit.ts.';

REVOKE ALL ON FUNCTION check_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, INT, INT) TO service_role;
