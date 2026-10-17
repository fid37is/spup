-- ============================================================
-- 056_premium_subscription.sql
--
-- Spup Premium (₦2,500 / 30 days, prepaid, renewed manually).
--
--   * Premium is required to START verification (phone, NIN, BVN) and to
--     EARN ad revenue (see app/api/ads/serve/route.ts).
--   * Verification is permanent. It never depends on Premium afterwards.
--   * Money already earned stays withdrawable even when Premium lapses.
--
-- Premium state lives in its own table (users can read their own rows but
-- have no write policy), so it can't be tampered with through the client
-- the way a column on `users` could.
--
-- Safe to run whether or not the earlier "pay per verification" draft
-- (055_kyc_payments.sql) was ever applied: it is dropped below.
-- ============================================================

-- ─── Clean up the abandoned per-verification payment draft ──────────────────
DROP FUNCTION IF EXISTS kyc_claim_attempt(UUID, TEXT);
DROP FUNCTION IF EXISTS kyc_release_attempt(UUID);
DROP TABLE    IF EXISTS kyc_payments;
DELETE FROM platform_settings WHERE key IN ('kyc_fee_nin_kobo', 'kyc_fee_bvn_kobo');

-- ─── Premium payments ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS premium_payments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_kobo   BIGINT NOT NULL CHECK (amount_kobo > 0),
  reference     TEXT NOT NULL UNIQUE,                 -- Paystack reference (SPUP-PREM-...)
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'paid', 'failed')),
  period_start  TIMESTAMPTZ,
  period_end    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_premium_payments_user
  ON premium_payments (user_id, status, period_end DESC);

ALTER TABLE premium_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS premium_payments_select_own ON premium_payments;
CREATE POLICY premium_payments_select_own ON premium_payments
  FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ─── Activate a paid reference ──────────────────────────────────────────────
-- Idempotent and race-safe (webhook + browser callback can both call it).
-- Renewing early stacks: the new 30 days start when the current period ends.
-- Returns the new period_end, or NULL if the reference is unknown/not pending.

CREATE OR REPLACE FUNCTION premium_activate(p_reference TEXT, p_days INT DEFAULT 30)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
DECLARE
  pay        premium_payments%ROWTYPE;
  cur_end    TIMESTAMPTZ;
  new_start  TIMESTAMPTZ;
BEGIN
  SELECT * INTO pay FROM premium_payments WHERE reference = p_reference;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- One user's activations run one at a time.
  PERFORM pg_advisory_xact_lock(hashtext(pay.user_id::text));

  SELECT * INTO pay FROM premium_payments WHERE reference = p_reference FOR UPDATE;
  IF pay.status = 'paid' THEN RETURN pay.period_end; END IF;
  IF pay.status <> 'pending' THEN RETURN NULL; END IF;

  SELECT MAX(period_end) INTO cur_end
    FROM premium_payments
   WHERE user_id = pay.user_id AND status = 'paid';

  new_start := GREATEST(NOW(), COALESCE(cur_end, NOW()));

  UPDATE premium_payments
     SET status = 'paid',
         paid_at = NOW(),
         period_start = new_start,
         period_end = new_start + make_interval(days => p_days)
   WHERE id = pay.id;

  RETURN new_start + make_interval(days => p_days);
END;
$$;

-- ─── Verification tries (cost control) ──────────────────────────────────────
-- Every provider lookup costs Spup money, so a user gets a limited number of
-- tries per kind per rolling window. A try is handed back (deleted) when the
-- failure was ours (provider down, our provider wallet empty, DB error).

CREATE TABLE IF NOT EXISTS kyc_attempts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('nin', 'bvn')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyc_attempts_user ON kyc_attempts (user_id, kind, created_at DESC);

ALTER TABLE kyc_attempts ENABLE ROW LEVEL SECURITY;   -- service role only

-- Returns one row (attempt_id, attempts_left) if a try was available, else none.
CREATE OR REPLACE FUNCTION kyc_claim_attempt(
  p_user_id UUID, p_kind TEXT, p_max INT DEFAULT 3, p_window_days INT DEFAULT 30
)
RETURNS TABLE (attempt_id UUID, attempts_left INT)
LANGUAGE plpgsql
AS $$
DECLARE
  used    INT;
  new_id  UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || p_kind));

  SELECT COUNT(*) INTO used
    FROM kyc_attempts k
   WHERE k.user_id = p_user_id AND k.kind = p_kind
     AND k.created_at > NOW() - make_interval(days => p_window_days);

  IF used >= p_max THEN RETURN; END IF;

  INSERT INTO kyc_attempts (user_id, kind) VALUES (p_user_id, p_kind) RETURNING id INTO new_id;

  attempt_id := new_id;
  attempts_left := p_max - used - 1;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION kyc_release_attempt(p_attempt_id UUID)
RETURNS VOID
LANGUAGE sql
AS $$
  DELETE FROM kyc_attempts WHERE id = p_attempt_id;
$$;

REVOKE ALL ON FUNCTION premium_activate(TEXT, INT)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION kyc_claim_attempt(UUID, TEXT, INT, INT)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION kyc_release_attempt(UUID)                   FROM PUBLIC, anon, authenticated;

-- ─── Price (kobo) — change any time, no deploy ──────────────────────────────
--   UPDATE platform_settings SET value = '300000'::jsonb, updated_at = NOW()
--    WHERE key = 'premium_price_kobo';
INSERT INTO platform_settings (key, value)
VALUES ('premium_price_kobo', '250000'::jsonb)     -- ₦2,500
ON CONFLICT (key) DO NOTHING;
