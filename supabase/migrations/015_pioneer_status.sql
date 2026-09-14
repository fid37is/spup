-- ============================================================
-- 015_pioneer_status.sql
--
-- "Pioneer" recognition for the first 200 people to actually create
-- a Spup account (signup order — not waitlist position, which is a
-- separate, pre-signup list). A pioneer's badge only turns gold once
-- they complete BOTH phone and BVN verification — same moment the
-- badge component already labels "BVN Verified" (see
-- verified-badge.tsx / bvn-kyc.ts) — so it doubles as an incentive
-- to actually finish verification, not just register early.
--
-- signup_number is assigned via a dedicated sequence rather than
-- computed from created_at, so it's race-safe under concurrent
-- signups and never needs recomputing later. is_pioneer is a STORED
-- generated column off it, so "pioneer or not" is decided once, at
-- signup, and never drifts as the user base grows past 200.
-- ============================================================

-- 1. Backfill signup_number for existing users, ordered by when they
--    actually signed up, before wiring up the sequence for new rows.
CREATE SEQUENCE IF NOT EXISTS user_signup_seq;

ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_number BIGINT;

UPDATE users u
   SET signup_number = ranked.rn
  FROM (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM users
    WHERE signup_number IS NULL
  ) ranked
 WHERE u.id = ranked.id;

SELECT setval('user_signup_seq', COALESCE((SELECT MAX(signup_number) FROM users), 0));

ALTER TABLE users ALTER COLUMN signup_number SET DEFAULT nextval('user_signup_seq');
ALTER TABLE users ALTER COLUMN signup_number SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_signup_number_unique UNIQUE (signup_number);

-- 2. is_pioneer follows directly from signup_number — first 200,
--    permanently, regardless of how large the user base grows later.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_pioneer BOOLEAN
  GENERATED ALWAYS AS (signup_number <= 200) STORED;

CREATE INDEX IF NOT EXISTS idx_users_is_pioneer ON users(is_pioneer) WHERE is_pioneer = true;

-- 3. New badge tier. Deliberately only reachable through the same
--    'none' -> verified bump bvn-kyc.ts already performs — never
--    downgrades/overwrites an existing 'creator' or 'organisation'
--    tier, exactly like the existing 'standard' bump doesn't.
--
-- NOTE: the retroactive backfill (upgrading existing 'standard'
-- pioneers to 'pioneer') is intentionally in the NEXT migration file
-- (016), not here. Postgres won't let a freshly-added enum value be
-- referenced by any DML in the same transaction that added it — since
-- Supabase runs each migration file as one transaction, doing both in
-- one file raises "unsafe use of new value" at apply time.
ALTER TYPE verification_tier ADD VALUE IF NOT EXISTS 'pioneer';
