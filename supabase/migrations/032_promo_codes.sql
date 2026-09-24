-- 027_promo_codes.sql
--
-- Free/comp promotions via a redeemable code, instead of a hardcoded account
-- allowlist: generate a code (optionally tied to one tier, a use limit, an
-- expiry, and a free-text label for tracking who it was given to - an
-- affiliate, a campaign, etc.), and anyone who redeems it while promoting a
-- post gets that promotion activated without going through Paystack. See
-- src/lib/promotions.ts (validation) and src/app/api/promotions/checkout/route.ts
-- (where it's redeemed).
--
-- Locked down entirely at the database level: RLS is enabled with NO policies,
-- so every access goes through the admin (service-role) client on the server -
-- either the admin actions in src/lib/actions/promo-codes.ts (generate/revoke),
-- or the checkout route's redemption step. No policy here means no amount of
-- client-side Supabase-JS code can read, guess-check, or spend a code.

CREATE TABLE IF NOT EXISTS promo_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,          -- stored/compared upper-cased
  label        TEXT,                          -- free text: "Instagram affiliate - @xyz", etc.
  tier         TEXT,                          -- one of the app's promotion tiers, or NULL = any tier
  max_uses     INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  times_used   INTEGER NOT NULL DEFAULT 0 CHECK (times_used >= 0),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at   TIMESTAMPTZ,                   -- NULL = never expires
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per redemption: which code, who used it, on which post, and which
-- promotion it activated - the audit trail behind "offer codes via affiliation
-- and see who used them."
CREATE TABLE IF NOT EXISTS promo_code_redemptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id  UUID NOT NULL REFERENCES promo_codes(id),
  user_id        UUID NOT NULL REFERENCES users(id),
  post_id        UUID NOT NULL REFERENCES posts(id),
  promotion_id   UUID REFERENCES post_promotions(id),
  redeemed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes (code);
CREATE INDEX IF NOT EXISTS idx_promo_code_redemptions_code ON promo_code_redemptions (promo_code_id);
CREATE INDEX IF NOT EXISTS idx_promo_code_redemptions_user ON promo_code_redemptions (user_id);

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_redemptions ENABLE ROW LEVEL SECURITY;
