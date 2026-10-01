-- 043_promotion_actual_revenue.sql
--
-- Promo-code promotions (free comps, and any discount codes) were stored with
-- price_kobo = the tier's LIST price, so every revenue sum over post_promotions
-- counted money that was never paid. price_kobo stays as the list price;
-- amount_paid_kobo is what was actually collected and is what revenue sums.
--
--   * paid via Paystack     -> set at verification to the amount Paystack confirmed
--   * redeemed with a code  -> 0 (free). A discount code would store the reduced
--                              amount actually charged.

ALTER TABLE post_promotions
  ADD COLUMN IF NOT EXISTS amount_paid_kobo BIGINT NOT NULL DEFAULT 0 CHECK (amount_paid_kobo >= 0);

-- Backfill from the ledger (ground truth): a paid promotion has a completed
-- promotion_spend transaction written by the verify route as <reference>-TXN.
-- Code redemptions never wrote one, so they correctly stay at 0.
UPDATE post_promotions p
SET    amount_paid_kobo = t.amount_kobo
FROM   transactions t
WHERE  t.reference = p.reference || '-TXN'
  AND  t.type      = 'promotion_spend'
  AND  t.status    = 'completed';
