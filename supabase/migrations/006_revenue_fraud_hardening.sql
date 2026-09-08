-- ============================================================
-- 006_revenue_fraud_hardening.sql
-- Adds: real BVN uniqueness, fraud flags, device fingerprint
-- logging, and 14-day payout cycle tracking.
--
-- NOTE: this migration assumes `ads`, `ad_impressions`,
-- `ad_clicks`, and `creator_ad_earnings` already exist in your
-- live database (referenced by src/app/api/ads/*), but they are
-- NOT present in your committed migrations (001, 005). Pull a
-- `supabase db diff` or pg_dump of those tables into their own
-- migration soon — right now a fresh `supabase db reset` would
-- not recreate them.
-- ============================================================

-- ─── Users: separate "phone verified" from "BVN verified" ─────────────────────
-- Previously, completing phone OTP set bvn_verified = true directly, with no
-- actual BVN check ever performed. This splits the two so bvn_verified only
-- becomes true after a real BVN check (see src/lib/actions/bvn-kyc.ts).

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false;

-- Backfill: anyone previously marked bvn_verified was really only phone-verified.
UPDATE users SET phone_verified = true WHERE bvn_verified = true;
UPDATE users SET bvn_verified = false;

ALTER TABLE users ADD COLUMN IF NOT EXISTS bvn_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bvn_verification_ref TEXT;

-- One BVN = one account, enforced at the DB level (partial index so multiple
-- NULLs — i.e. not-yet-verified users — don't collide with each other).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_bvn_hash_unique
  ON users (bvn_hash) WHERE bvn_hash IS NOT NULL;


-- ─── Wallets: track payout cycle ───────────────────────────────────────────────

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS last_payout_at TIMESTAMPTZ;


-- ─── Fraud flags — human-reviewable queue ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS fraud_flags (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  flag_type    TEXT NOT NULL,   -- 'duplicate_bvn_attempt' | 'device_cluster' | 'impression_cap_exceeded' | 'self_view'
  details      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved     BOOLEAN NOT NULL DEFAULT false,
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_fraud_flags_unresolved ON fraud_flags (resolved, created_at) WHERE resolved = false;


-- ─── Device fingerprint log — multi-account detection ──────────────────────────
-- Web-only, so this is a composite of browser signals rather than a hardware ID.
-- Populate device_fingerprint from a client-side hash (e.g. FingerprintJS) sent
-- in a header/cookie on signup and on ad impressions.

CREATE TABLE IF NOT EXISTS device_fingerprint_log (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_fingerprint TEXT NOT NULL,
  user_id            UUID REFERENCES users(id) ON DELETE CASCADE,
  ip_hash            TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_fp ON device_fingerprint_log (device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_device_fp_user ON device_fingerprint_log (user_id);

-- Run on a schedule (e.g. daily via pg_cron or an edge function cron trigger).
-- Flags any device fingerprint linked to 3+ distinct verified accounts within
-- a rolling 30-day window. Threshold is 3, not 2, since two accounts sharing a
-- device (family, cybercafé) is common and shouldn't auto-flag.
CREATE OR REPLACE FUNCTION detect_device_clusters()
RETURNS void AS $$
BEGIN
  INSERT INTO fraud_flags (user_id, flag_type, details)
  SELECT DISTINCT ON (d.device_fingerprint)
    NULL,
    'device_cluster',
    jsonb_build_object(
      'device_fingerprint', d.device_fingerprint,
      'account_count', sub.account_count,
      'user_ids', sub.user_ids
    )
  FROM (
    SELECT
      device_fingerprint,
      COUNT(DISTINCT user_id) AS account_count,
      array_agg(DISTINCT user_id) AS user_ids
    FROM device_fingerprint_log
    WHERE created_at >= now() - interval '30 days'
      AND user_id IS NOT NULL
    GROUP BY device_fingerprint
    HAVING COUNT(DISTINCT user_id) >= 3
  ) sub
  JOIN device_fingerprint_log d ON d.device_fingerprint = sub.device_fingerprint
  WHERE NOT EXISTS (
    SELECT 1 FROM fraud_flags f
    WHERE f.flag_type = 'device_cluster'
      AND f.details->>'device_fingerprint' = d.device_fingerprint
      AND f.created_at >= now() - interval '30 days'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── Impression rate-limit helper ───────────────────────────────────────────────
-- Used by the ad-serving route to decide whether a viewer's impression should
-- count toward a given creator's earnings today.
-- Defaults: max 5 credited impressions per (viewer, creator) per day,
-- max 1 credited impression per (viewer, post) per day.

CREATE OR REPLACE FUNCTION count_viewer_creator_impressions_today(
  p_viewer_id UUID,
  p_creator_id UUID
) RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM ad_impressions ai
  JOIN posts p ON p.id = ai.post_id
  WHERE ai.user_id = p_viewer_id
    AND p.user_id = p_creator_id
    AND ai.created_at >= date_trunc('day', now());
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION count_viewer_post_impressions_today(
  p_viewer_id UUID,
  p_post_id UUID
) RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM ad_impressions
  WHERE user_id = p_viewer_id
    AND post_id = p_post_id
    AND created_at >= date_trunc('day', now());
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION count_viewer_creator_impressions_today(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION count_viewer_post_impressions_today(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION detect_device_clusters() TO service_role;
