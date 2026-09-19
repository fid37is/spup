-- 023_nin_verification.sql
--
-- Introduces NIN as the baseline identity verification (what earns the
-- "Verified" badge, what's required for any withdrawal, and what's
-- required to sell via escrow). BVN is kept exactly as it was — same
-- columns, same hashing — but demoted to an additional check only
-- required for large-sum withdrawals. See:
--   - lib/actions/nin-kyc.ts   (new — mirrors bvn-kyc.ts)
--   - lib/actions/bvn-kyc.ts   (updated — no longer bumps verification_tier)
--   - app/api/paystack/initiate/route.ts (nin_verified baseline + bvn_verified for big sums)
--   - lib/constants.ts         (BIG_TRANSACTION_THRESHOLD_KOBO)

ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_verification_ref TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_verified BOOLEAN NOT NULL DEFAULT false;

-- Same pattern as idx_users_bvn_hash_unique (006_revenue_fraud_hardening.sql) —
-- one NIN can only ever be linked to one account.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nin_hash_unique
  ON users (nin_hash) WHERE nin_hash IS NOT NULL;
